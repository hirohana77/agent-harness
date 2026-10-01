import { spawn } from 'node:child_process';
import path from 'node:path';
import { ToolCallResult } from '../../core/types.js';
import { CommandExecutionOptions } from '../executor.js';
import { SandboxBackend, SandboxBackendType } from '../types.js';

export class LocalSandboxBackend implements SandboxBackend {
  public readonly id: string;
  public readonly type: SandboxBackendType = 'local';
  private workspaceRoot?: string;
  private maxOutputBytes: number;

  constructor(maxOutputBytes = 1024 * 1024) {
    this.id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.maxOutputBytes = maxOutputBytes;
  }

  public async setup(workspacePath: string): Promise<void> {
    this.workspaceRoot = path.resolve(workspacePath);
  }

  public async execute(command: string, options: CommandExecutionOptions = {}): Promise<ToolCallResult> {
    const timeout = options.timeoutMs ?? 15000;
    const cwd = options.cwd ?? this.workspaceRoot;

    return new Promise<ToolCallResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn(command, {
        cwd,
        shell: true,
        env: {
          ...process.env,
          ...options.env,
          CI: 'true',
        },
      });

      const timer = setTimeout(() => {
        killed = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        child.stdout?.destroy();
        child.stderr?.destroy();
      }, timeout);

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          killed = true;
          child.kill('SIGKILL');
        });
      }

      child.stdout?.on('data', (chunk) => {
        if (stdout.length < this.maxOutputBytes) {
          stdout += chunk.toString();
        }
      });

      child.stderr?.on('data', (chunk) => {
        if (stderr.length < this.maxOutputBytes) {
          stderr += chunk.toString();
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: `Process error: ${err.message}`,
          exitCode: 1,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const exitCode = killed ? 124 : (code ?? 0);
        const success = exitCode === 0;

        let errorMsg: string | undefined;
        if (killed) {
          errorMsg = `Command timed out after ${timeout}ms: ${command}`;
        } else if (!success) {
          errorMsg = stderr.trim() || `Command failed with exit code ${exitCode}`;
        }

        resolve({
          success,
          output: stdout.trim(),
          error: errorMsg,
          exitCode,
        });
      });
    });
  }

  public async teardown(): Promise<void> {
    // No-op for local backend since workspace cleanup is handled by WorkspaceManager
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot || process.cwd();
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }
}

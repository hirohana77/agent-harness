import { spawn } from 'node:child_process';
import { ToolCallResult } from '../core/types.js';
import { SecurityPolicyChecker } from './security.js';

export interface CommandExecutionOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export class CommandExecutor {
  private security: SecurityPolicyChecker;
  private defaultCwd?: string;
  private maxOutputBytes: number;

  constructor(security: SecurityPolicyChecker, defaultCwd?: string, maxOutputBytes = 1024 * 1024) {
    this.security = security;
    this.defaultCwd = defaultCwd;
    this.maxOutputBytes = maxOutputBytes;
  }

  /**
   * Run a shell command securely within the sandbox
   */
  public async execute(command: string, options: CommandExecutionOptions = {}): Promise<ToolCallResult> {
    const startTime = Date.now();

    // 1. Security validation
    try {
      this.security.validateCommand(command);
    } catch (err: unknown) {
      return {
        success: false,
        error: (err as Error).message,
        exitCode: 126,
      };
    }

    const timeout = options.timeoutMs ?? 15000;

    return new Promise<ToolCallResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn(command, {
        cwd: options.cwd,
        shell: true,
        env: {
          ...process.env,
          ...options.env,
          CI: 'true',
        },
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Already dead
          }
        }, 1000);
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
}

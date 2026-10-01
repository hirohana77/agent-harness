import { spawn, spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { ToolCallResult, ContainerConfig } from '../../core/types.js';
import { CommandExecutionOptions } from '../executor.js';
import { SandboxBackend, SandboxBackendType, ContainerInspectInfo, ContainerRuntime } from '../types.js';
import { ContainerSandboxError } from '../../core/errors.js';

const execFileAsync = promisify(execFile);

interface ActiveContainerEntry {
  runtime: string;
  containerName: string;
}

/**
 * Singleton process registry to track and guarantee cleanup of containers across process lifecycle
 */
export class ContainerProcessRegistry {
  private static activeContainers: Map<string, ActiveContainerEntry> = new Map();
  private static hooksInstalled = false;

  public static register(runtime: string, containerName: string): void {
    ContainerProcessRegistry.activeContainers.set(containerName, { runtime, containerName });
    ContainerProcessRegistry.ensureHooks();
  }

  public static unregister(containerName: string): void {
    ContainerProcessRegistry.activeContainers.delete(containerName);
  }

  public static getActiveCount(): number {
    return ContainerProcessRegistry.activeContainers.size;
  }

  public static cleanupAll(): void {
    for (const { runtime, containerName } of ContainerProcessRegistry.activeContainers.values()) {
      try {
        spawnSync(runtime, ['rm', '-f', containerName], {
          stdio: 'ignore',
          timeout: 4000,
        });
      } catch {
        // Suppress during process exit
      }
    }
    ContainerProcessRegistry.activeContainers.clear();
  }

  private static ensureHooks(): void {
    if (ContainerProcessRegistry.hooksInstalled) return;
    ContainerProcessRegistry.hooksInstalled = true;

    const cleanup = () => {
      ContainerProcessRegistry.cleanupAll();
    };

    process.once('exit', cleanup);
    process.once('SIGINT', () => {
      cleanup();
      process.exit(130);
    });
    process.once('SIGTERM', () => {
      cleanup();
      process.exit(143);
    });
    process.once('SIGHUP', () => {
      cleanup();
      process.exit(129);
    });
  }
}

export class ContainerSandboxBackend implements SandboxBackend {
  public readonly id: string;
  public readonly type: SandboxBackendType;
  private runtime: ContainerRuntime;
  private config: ContainerConfig;
  private containerName: string;
  private containerId?: string;
  private workspaceHostPath?: string;
  private containerWorkdir: string;
  private isStarted = false;
  private isCleanedUp = false;
  private maxOutputBytes: number;

  constructor(
    config: Partial<ContainerConfig> = {},
    runtime: ContainerRuntime = 'docker',
    maxOutputBytes = 1024 * 1024
  ) {
    this.runtime = runtime;
    this.type = runtime;
    this.maxOutputBytes = maxOutputBytes;
    this.config = {
      image: config.image || 'alpine:latest',
      runtime: runtime,
      workdir: config.workdir || '/workspace',
      network: config.network || 'none',
      memoryLimit: config.memoryLimit,
      cpuLimit: config.cpuLimit,
      pidsLimit: config.pidsLimit,
      env: config.env || {},
      user: config.user,
      privileged: config.privileged ?? false,
      removeOnExit: config.removeOnExit ?? true,
      pullPolicy: config.pullPolicy || 'if-not-present',
      extraArgs: config.extraArgs || [],
    };

    this.containerWorkdir = this.config.workdir || '/workspace';
    this.containerName = `ah-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.id = this.containerName;
  }

  public getContainerName(): string {
    return this.containerName;
  }

  public getContainerId(): string | undefined {
    return this.containerId;
  }

  public getRuntime(): ContainerRuntime {
    return this.runtime;
  }

  public async setup(workspacePath: string): Promise<void> {
    if (this.isStarted) return;
    this.workspaceHostPath = path.resolve(workspacePath);

    // 1. Verify container runtime executable
    try {
      await execFileAsync(this.runtime, ['--version']);
    } catch (err: unknown) {
      throw new ContainerSandboxError(
        `Container runtime "${this.runtime}" is not available or not in PATH: ${(err as Error).message}`
      );
    }

    // 2. Handle image pull policy
    await this.ensureImage();

    // 3. Assemble container run command
    const args: string[] = [
      'run',
      '-d',
      '--name',
      this.containerName,
      '-v',
      `${this.workspaceHostPath}:${this.containerWorkdir}`,
      '--workdir',
      this.containerWorkdir,
    ];

    if (this.config.network) {
      args.push('--network', this.config.network);
    }
    if (this.config.memoryLimit) {
      args.push('--memory', this.config.memoryLimit);
    }
    if (this.config.cpuLimit) {
      args.push('--cpus', String(this.config.cpuLimit));
    }
    if (this.config.pidsLimit) {
      args.push('--pids-limit', String(this.config.pidsLimit));
    }
    if (this.config.user) {
      args.push('--user', this.config.user);
    }
    if (this.config.privileged) {
      args.push('--privileged');
    }
    if (this.config.env) {
      for (const [key, value] of Object.entries(this.config.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }
    if (this.config.extraArgs && this.config.extraArgs.length > 0) {
      args.push(...this.config.extraArgs);
    }

    // Target image
    args.push(this.config.image);

    // Keep container alive with sh loop
    args.push('sh', '-c', "trap 'exit 0' TERM INT; while true; do sleep 3600; done");

    try {
      const { stdout } = await execFileAsync(this.runtime, args);
      this.containerId = stdout.trim();
      this.isStarted = true;
      ContainerProcessRegistry.register(this.runtime, this.containerName);
    } catch (err: unknown) {
      await this.teardown().catch(() => {});
      throw new ContainerSandboxError(
        `Failed to start container "${this.containerName}" (${this.config.image}): ${(err as Error).message}`
      );
    }
  }

  private async ensureImage(): Promise<void> {
    const policy = this.config.pullPolicy;
    if (policy === 'never') return;

    let imageExists = false;
    try {
      await execFileAsync(this.runtime, ['image', 'inspect', this.config.image]);
      imageExists = true;
    } catch {
      imageExists = false;
    }

    if (!imageExists || policy === 'always') {
      try {
        await execFileAsync(this.runtime, ['pull', this.config.image]);
      } catch (err: unknown) {
        if (!imageExists) {
          throw new ContainerSandboxError(
            `Failed to pull container image "${this.config.image}": ${(err as Error).message}`
          );
        }
      }
    }
  }

  public async execute(command: string, options: CommandExecutionOptions = {}): Promise<ToolCallResult> {
    if (!this.isStarted || this.isCleanedUp) {
      throw new ContainerSandboxError('Container sandbox is not running or has been torn down.');
    }

    const timeout = options.timeoutMs ?? 15000;
    const args: string[] = ['exec', '-i'];

    // Resolve workdir
    let targetWorkdir = this.containerWorkdir;
    if (options.cwd && this.workspaceHostPath) {
      const resolvedCwd = path.resolve(options.cwd);
      if (resolvedCwd.startsWith(this.workspaceHostPath)) {
        const rel = path.relative(this.workspaceHostPath, resolvedCwd);
        targetWorkdir = path.posix.join(this.containerWorkdir, rel.split(path.sep).join('/'));
      } else {
        targetWorkdir = options.cwd;
      }
    }
    args.push('-w', targetWorkdir);

    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }

    args.push(this.containerName, '/bin/sh', '-c', command);

    return new Promise<ToolCallResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn(this.runtime, args);

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
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore
          }
          child.stdout?.destroy();
          child.stderr?.destroy();
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
          error: `Process error during container exec: ${err.message}`,
          exitCode: 1,
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const exitCode = killed ? 124 : (code ?? 0);
        const success = exitCode === 0;

        let errorMsg: string | undefined;
        if (killed) {
          errorMsg = `Container command timed out after ${timeout}ms: ${command}`;
        } else if (!success) {
          errorMsg = stderr.trim() || `Command failed inside container with exit code ${exitCode}`;
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
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;
    ContainerProcessRegistry.unregister(this.containerName);

    if (this.isStarted || this.containerName) {
      try {
        await execFileAsync(this.runtime, ['rm', '-f', this.containerName]);
      } catch {
        // Container might have already stopped or been removed
      }
    }
  }

  public getWorkspaceRoot(): string {
    return this.containerWorkdir;
  }

  public async isHealthy(): Promise<boolean> {
    if (!this.isStarted || this.isCleanedUp) return false;
    try {
      const inspect = await this.inspect();
      return !!inspect?.running;
    } catch {
      return false;
    }
  }

  public async inspect(): Promise<ContainerInspectInfo | null> {
    if (!this.containerName) return null;
    try {
      const { stdout } = await execFileAsync(this.runtime, [
        'inspect',
        '--format',
        '{{json .}}',
        this.containerName,
      ]);
      const raw = JSON.parse(stdout);
      return {
        id: raw.Id || this.containerId || '',
        name: raw.Name || this.containerName,
        image: raw.Config?.Image || this.config.image,
        status: raw.State?.Status || 'unknown',
        running: !!raw.State?.Running,
        exitCode: raw.State?.ExitCode,
      };
    } catch {
      return null;
    }
  }
}

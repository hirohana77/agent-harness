import { ToolCallResult, ContainerConfig, SandboxConfig } from '../core/types.js';
import { CommandExecutionOptions } from './executor.js';

export type SandboxBackendType = 'local' | 'docker' | 'podman';
export type ContainerRuntime = 'docker' | 'podman';
export type ContainerPullPolicy = 'always' | 'if-not-present' | 'never';

export type { ContainerConfig };

export type { SandboxConfig };

export interface ContainerInspectInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
  exitCode?: number;
}

/**
 * Pluggable execution backend contract for sandbox execution
 */
export interface SandboxBackend {
  readonly id: string;
  readonly type: SandboxBackendType;

  /**
   * Initializes and prepares the sandbox environment with the mounted workspace
   */
  setup(workspacePath: string): Promise<void>;

  /**
   * Executes a command within the sandbox
   */
  execute(command: string, options?: CommandExecutionOptions): Promise<ToolCallResult>;

  /**
   * Cleans up and releases sandbox resources
   */
  teardown(): Promise<void>;

  /**
   * Gets the root workspace path inside the execution context
   */
  getWorkspaceRoot(): string;

  /**
   * Checks whether the sandbox backend is healthy and ready to accept commands
   */
  isHealthy(): Promise<boolean>;

  /**
   * Optional inspection information for container backends
   */
  inspect?(): Promise<ContainerInspectInfo | null>;
}

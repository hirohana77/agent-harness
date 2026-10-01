import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SandboxConfig } from '../../core/types.js';
import { SandboxBackend, ContainerRuntime } from '../types.js';
import { LocalSandboxBackend } from './local.js';
import { ContainerSandboxBackend } from './container.js';
import { ContainerSandboxError } from '../../core/errors.js';

const execFileAsync = promisify(execFile);

let cachedDockerAvailable: boolean | null = null;
let cachedPodmanAvailable: boolean | null = null;

export class SandboxBackendFactory {
  /**
   * Probes system to detect available container runtime
   */
  public static async detectRuntime(
    preferred: 'docker' | 'podman' | 'auto' = 'auto'
  ): Promise<ContainerRuntime> {
    if (preferred === 'docker') {
      const ok = await SandboxBackendFactory.isRuntimeAvailable('docker');
      if (!ok) {
        throw new ContainerSandboxError(
          'Docker runtime requested but docker command is not available or daemon is unreachable. ' +
          'Ensure Docker is installed and the daemon is running (e.g., `systemctl start docker` or launch Docker Desktop).'
        );
      }
      return 'docker';
    }

    if (preferred === 'podman') {
      const ok = await SandboxBackendFactory.isRuntimeAvailable('podman');
      if (!ok) {
        throw new ContainerSandboxError(
          'Podman runtime requested but podman command is not available. ' +
          'Ensure Podman is installed and available in system PATH.'
        );
      }
      return 'podman';
    }

    // Auto detection: check docker first, then podman
    if (await SandboxBackendFactory.isRuntimeAvailable('docker')) {
      return 'docker';
    }
    if (await SandboxBackendFactory.isRuntimeAvailable('podman')) {
      return 'podman';
    }

    throw new ContainerSandboxError(
      'No active container runtime found. Docker or Podman must be installed and active for container sandbox execution.'
    );
  }

  /**
   * Check if a specific container runtime is executable and healthy
   */
  public static async isRuntimeAvailable(runtime: 'docker' | 'podman'): Promise<boolean> {
    if (runtime === 'docker' && cachedDockerAvailable !== null) {
      return cachedDockerAvailable;
    }
    if (runtime === 'podman' && cachedPodmanAvailable !== null) {
      return cachedPodmanAvailable;
    }

    try {
      await execFileAsync(runtime, ['info'], { timeout: 2000 });
      if (runtime === 'docker') cachedDockerAvailable = true;
      if (runtime === 'podman') cachedPodmanAvailable = true;
      return true;
    } catch {
      if (runtime === 'docker') cachedDockerAvailable = false;
      if (runtime === 'podman') cachedPodmanAvailable = false;
      return false;
    }
  }

  /**
   * Reset runtime detection cache (useful for testing and dynamic reconnects)
   */
  public static resetCache(): void {
    cachedDockerAvailable = null;
    cachedPodmanAvailable = null;
  }

  /**
   * Factory method to create appropriate SandboxBackend instance
   */
  public static async create(
    config?: Partial<SandboxConfig>,
    maxOutputBytes = 1024 * 1024
  ): Promise<SandboxBackend> {
    const backendType = config?.backend || 'local';

    if (backendType === 'local') {
      return new LocalSandboxBackend(maxOutputBytes);
    }

    if (backendType === 'docker' || backendType === 'podman') {
      const preferred = config?.container?.runtime ?? (backendType === 'podman' ? 'podman' : 'docker');
      const runtime = await SandboxBackendFactory.detectRuntime(preferred);
      return new ContainerSandboxBackend(config?.container, runtime, maxOutputBytes);
    }

    throw new ContainerSandboxError(`Unknown sandbox backend type: "${backendType}"`);
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { LocalSandboxBackend } from '../src/sandbox/backends/local.js';
import { ContainerSandboxBackend } from '../src/sandbox/backends/container.js';
import { SandboxBackendFactory } from '../src/sandbox/backends/factory.js';
import { ContainerSandboxError } from '../src/core/errors.js';

// Probe whether Docker is actually accessible and has a test image
let isDockerAvailable = false;
let testDockerImage = 'agent-harness/sandbox-base:latest';

try {
  execSync('docker info', { stdio: 'ignore', timeout: 2000 });
  // check if our base image or redis:7-alpine exists
  const images = execSync('docker images --format "{{.Repository}}:{{.Tag}}"', { encoding: 'utf8' });
  if (images.includes('agent-harness/sandbox-base:latest')) {
    testDockerImage = 'agent-harness/sandbox-base:latest';
    isDockerAvailable = true;
  } else if (images.includes('redis:7-alpine')) {
    testDockerImage = 'redis:7-alpine';
    isDockerAvailable = true;
  }
} catch {
  isDockerAvailable = false;
}

describe('LocalSandboxBackend', () => {
  let tempDir: string;
  let backend: LocalSandboxBackend;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-local-test-'));
    backend = new LocalSandboxBackend();
    await backend.setup(tempDir);
  });

  afterEach(async () => {
    await backend.teardown();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('executes simple command and captures stdout', async () => {
    const result = await backend.execute('echo "hello local"');
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello local');
    expect(result.exitCode).toBe(0);
  });

  it('captures non-zero exit code and stderr on failure', async () => {
    const result = await backend.execute('sh -c "echo failure_msg >&2; exit 42"');
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(42);
    expect(result.error).toContain('failure_msg');
  });

  it('respects cwd and env options', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir, { recursive: true });

    const result = await backend.execute('pwd && echo MY_VAR=$TEST_VAR', {
      cwd: subDir,
      env: { TEST_VAR: 'custom_value' },
    });

    expect(result.success).toBe(true);
    expect(result.output).toContain(subDir);
    expect(result.output).toContain('MY_VAR=custom_value');
  });

  it('terminates command when timeout exceeded', async () => {
    const result = await backend.execute('sleep 5', { timeoutMs: 100 });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(124);
    expect(result.error).toContain('timed out');
  });

  it('reports healthy state and returns workspace root', async () => {
    expect(await backend.isHealthy()).toBe(true);
    expect(backend.getWorkspaceRoot()).toBe(tempDir);
  });
});

describe('SandboxBackendFactory', () => {
  beforeEach(() => {
    SandboxBackendFactory.resetCache();
  });

  it('creates LocalSandboxBackend by default', async () => {
    const backend = await SandboxBackendFactory.create();
    expect(backend.type).toBe('local');
    expect(backend instanceof LocalSandboxBackend).toBe(true);
  });

  it('creates LocalSandboxBackend when backend is "local"', async () => {
    const backend = await SandboxBackendFactory.create({ backend: 'local' });
    expect(backend.type).toBe('local');
  });

  it('throws ContainerSandboxError on unknown backend', async () => {
    await expect(
      SandboxBackendFactory.create({ backend: 'unsupported' as any })
    ).rejects.toThrow(ContainerSandboxError);
  });

  it('detects runtime availability with caching', async () => {
    const spy = vi.spyOn(SandboxBackendFactory, 'isRuntimeAvailable').mockResolvedValue(true);
    const runtime = await SandboxBackendFactory.detectRuntime('docker');
    expect(runtime).toBe('docker');
    expect(spy).toHaveBeenCalledWith('docker');
    spy.mockRestore();
  });
});

describe('ContainerSandboxBackend Unit / Mock', () => {
  it('initializes with default configuration options', () => {
    const container = new ContainerSandboxBackend({
      image: 'alpine:latest',
      network: 'bridge',
      memoryLimit: '256m',
      cpuLimit: 1.0,
      pidsLimit: 50,
    }, 'docker');

    expect(container.type).toBe('docker');
    expect(container.getRuntime()).toBe('docker');
    expect(container.getWorkspaceRoot()).toBe('/workspace');
    expect(container.getContainerName()).toMatch(/^ah-sandbox-/);
  });

  it('throws when executing on unstarted container', async () => {
    const container = new ContainerSandboxBackend({ image: 'alpine:latest' });
    await expect(container.execute('ls')).rejects.toThrow(ContainerSandboxError);
  });
});

describe.runIf(isDockerAvailable)('ContainerSandboxBackend Live Docker Integration', () => {
  let tempDir: string;
  let backend: ContainerSandboxBackend;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-docker-test-'));
    // write a test file on the host
    await fs.writeFile(path.join(tempDir, 'host-file.txt'), 'content-from-host', 'utf8');

    backend = new ContainerSandboxBackend(
      {
        image: testDockerImage,
        network: 'none',
        memoryLimit: '256m',
        workdir: '/workspace',
        env: { HARNESS_ENV: 'container-active' },
      },
      'docker'
    );

    await backend.setup(tempDir);
  });

  afterEach(async () => {
    await backend.teardown();
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('starts container and executes commands inside container', async () => {
    expect(await backend.isHealthy()).toBe(true);

    const result = await backend.execute('echo "hello from inside container"');
    expect(result.success).toBe(true);
    expect(result.output).toBe('hello from inside container');
  });

  it('reads host files mounted into /workspace', async () => {
    const result = await backend.execute('cat host-file.txt');
    expect(result.success).toBe(true);
    expect(result.output).toBe('content-from-host');
  });

  it('writes files inside container and reflects changes on host workspace', async () => {
    const result = await backend.execute('echo "created-inside-container" > container-file.txt');
    expect(result.success).toBe(true);

    const onHost = await fs.readFile(path.join(tempDir, 'container-file.txt'), 'utf8');
    expect(onHost.trim()).toBe('created-inside-container');
  });

  it('captures environment variables and non-zero exit codes', async () => {
    const envResult = await backend.execute('echo $HARNESS_ENV');
    expect(envResult.success).toBe(true);
    expect(envResult.output).toBe('container-active');

    const failResult = await backend.execute('sh -c "exit 99"');
    expect(failResult.success).toBe(false);
    expect(failResult.exitCode).toBe(99);
  });

  it('returns inspect metadata including container status and image', async () => {
    const inspect = await backend.inspect();
    expect(inspect).not.toBeNull();
    expect(inspect?.running).toBe(true);
    expect(inspect?.image).toBeTruthy();
  });

  it('cleans up container on teardown', async () => {
    const containerName = backend.getContainerName();
    await backend.teardown();

    // Verify container is no longer running or existing
    expect(await backend.isHealthy()).toBe(false);
    let inspectAfter: string | null = null;
    try {
      inspectAfter = execSync(`docker inspect ${containerName}`, { stdio: 'pipe', encoding: 'utf8' });
    } catch {
      inspectAfter = null;
    }
    expect(inspectAfter).toBeNull();
  });
});

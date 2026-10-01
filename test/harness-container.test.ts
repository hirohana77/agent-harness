import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { AgentHarness } from '../src/core/harness.js';
import { ScenarioDefinition } from '../src/core/types.js';
import { TrajectoryEventBus } from '../src/events/bus.js';
import { TrajectoryEvent } from '../src/events/types.js';
import { BufferedStreamObserver } from '../src/events/observers/buffer.js';

let isDockerAvailable = false;
let testDockerImage = 'agent-harness/sandbox-base:latest';

try {
  execSync('docker info', { stdio: 'ignore', timeout: 2000 });
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

describe.runIf(isDockerAvailable)('AgentHarness Container Sandbox Integration', () => {
  it('runs scenario in container sandbox, emits events, and verifies assertions', async () => {
    const scenario: ScenarioDefinition = {
      id: 'container-e2e-scenario',
      name: 'Container Sandbox E2E Evaluation',
      description: 'Verifies container sandbox execution and event emission',
      version: '1.0.0',
      workspace: {
        cleanup: true,
        gitInit: false,
        initialFiles: {
          'input.txt': 'initial input data',
        },
      },
      sandbox: {
        backend: 'docker',
        container: {
          image: testDockerImage,
          network: 'none',
          memoryLimit: '128m',
          workdir: '/workspace',
        },
      },
      task: {
        instruction: 'Read input.txt and generate result.txt with uppercase contents',
      },
      budgets: {
        maxTurns: 5,
        timeoutMs: 30000,
        maxTokens: 10000,
      },
      security: {
        allowedCommands: ['*'],
        deniedCommands: [],
        allowedPaths: ['.'],
        networkEnabled: false,
      },
      assertions: {
        files: [
          {
            path: 'result.txt',
            shouldExist: true,
            contains: 'INITIAL INPUT DATA',
          },
        ],
        commands: [
          {
            name: 'Check file output inside container',
            command: 'cat result.txt',
            expectedExitCode: 0,
            stdoutContains: 'INITIAL INPUT DATA',
          },
        ],
        trajectory: [
          {
            rule: 'max_turns',
            param: 3,
          },
        ],
      },
    };

    const eventBus = new TrajectoryEventBus();
    const buffer = new BufferedStreamObserver(100);
    const capturedEvents: TrajectoryEvent[] = [];
    eventBus.on('*', (evt) => capturedEvents.push(evt));

    const { report, trajectory } = await AgentHarness.runScenario(
      scenario,
      async (ctx) => {
        expect(ctx.backend.type).toBe('docker');
        expect(await ctx.backend.isHealthy()).toBe(true);

        ctx.recorder.startTurn('Read input and create output', 'Transforming text');

        // 1. Tool call to read file
        const readResult = await ctx.tools.call('read_file', { path: 'input.txt' });
        expect(readResult.success).toBe(true);
        const transformed = (readResult.output || '').toUpperCase();

        // 2. Tool call to write file
        const writeResult = await ctx.tools.call('write_file', {
          path: 'result.txt',
          content: transformed,
        });
        expect(writeResult.success).toBe(true);

        // 3. Tool call to exec bash inside container
        const execResult = await ctx.tools.call('exec_command', {
          command: 'cat result.txt && echo "EXEC_OK"',
        });
        expect(execResult.success).toBe(true);
        expect(execResult.output).toContain('EXEC_OK');

        ctx.recorder.completeTurn('Finished transforming input to result', {
          promptTokens: 50,
          completionTokens: 25,
          totalTokens: 75,
        });
      },
      { eventBus, observers: [buffer] }
    );

    // Verify scenario completed and passed
    expect(report.passed).toBe(true);
    expect(report.metrics.passedAssertions).toBe(3);
    expect(report.metrics.failedAssertions).toBe(0);
    expect(trajectory.status).toBe('completed');

    // Verify sandbox lifecycle events
    const readyEvent = capturedEvents.find((e) => e.type === 'sandbox:ready');
    expect(readyEvent).toBeDefined();
    expect((readyEvent as any).backend).toBe('docker');
    expect((readyEvent as any).image).toBe(testDockerImage);

    const teardownEvent = capturedEvents.find((e) => e.type === 'sandbox:teardown');
    expect(teardownEvent).toBeDefined();
    expect((teardownEvent as any).backend).toBe('docker');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from '../../src/sandbox/workspace.js';
import { CommandExecutor } from '../../src/sandbox/executor.js';
import { SecurityPolicyChecker } from '../../src/sandbox/security.js';
import { FileVerifier } from '../../src/verifier/file-verifier.js';
import { CommandVerifier } from '../../src/verifier/command-verifier.js';
import { TrajectoryVerifier } from '../../src/verifier/trajectory-verifier.js';
import { ScenarioVerifier } from '../../src/verifier/index.js';
import { ScenarioDefinitionSchema } from '../../src/core/schemas.js';
import { Trajectory } from '../../src/core/types.js';

describe('Verifier Engine', () => {
  let ws: WorkspaceManager;
  let executor: CommandExecutor;

  beforeEach(async () => {
    ws = new WorkspaceManager();
    await ws.setup({
      initialFiles: {
        'greeting.txt': 'Hello, Agent Harness World!',
        'config.json': '{"port": 8080, "debug": true}',
      },
    });
    executor = new CommandExecutor(new SecurityPolicyChecker());
  });

  afterEach(async () => {
    await ws.teardown();
  });

  it('verifies file content, regex, and existence assertions', async () => {
    const fv = new FileVerifier(ws);

    const res1 = await fv.verifyOne({
      path: 'greeting.txt',
      shouldExist: true,
      contains: 'Harness',
      matchesRegex: 'Hello.*World',
    });
    expect(res1.passed).toBe(true);

    const res2 = await fv.verifyOne({
      path: 'non-existent.txt',
      shouldExist: true,
    });
    expect(res2.passed).toBe(false);

    const res3 = await fv.verifyOne({
      path: 'config.json',
      jsonSchema: {},
    });
    expect(res3.passed).toBe(true);
  });

  it('verifies command execution and outputs in workspace', async () => {
    const cv = new CommandVerifier(executor, ws.getWorkspacePath());

    const passRes = await cv.verifyOne({
      name: 'Check file output',
      command: 'cat greeting.txt',
      expectedExitCode: 0,
      stdoutContains: 'Hello',
    });
    expect(passRes.passed).toBe(true);

    const failRes = await cv.verifyOne({
      name: 'Should fail with bad exit code',
      command: 'exit 42',
      expectedExitCode: 0,
    });
    expect(failRes.passed).toBe(false);
  });

  it('verifies trajectory behavior rules', () => {
    const mockTrajectory: Trajectory = {
      scenarioId: 'test-traj',
      startedAt: new Date().toISOString(),
      durationMs: 120,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'run build',
          toolCalls: [
            {
              callId: 'call-1',
              toolName: 'exec',
              arguments: { cmd: 'npm run build' },
              durationMs: 50,
            },
          ],
        },
      ],
      summary: {
        totalTurns: 1,
        totalToolCalls: 1,
        totalTokens: 150,
        completed: true,
      },
    };

    const tv = new TrajectoryVerifier(mockTrajectory);

    const r1 = tv.verifyOne({ rule: 'max_turns', param: 5 });
    expect(r1.passed).toBe(true);

    const r2 = tv.verifyOne({ rule: 'tool_used', param: 'exec' });
    expect(r2.passed).toBe(true);

    const r3 = tv.verifyOne({ rule: 'tool_not_used', param: 'delete_database' });
    expect(r3.passed).toBe(true);

    const r4 = tv.verifyOne({ rule: 'no_denied_commands' });
    expect(r4.passed).toBe(true);
  });

  it('runs scenario verifier to assemble complete report', async () => {
    const scenario = ScenarioDefinitionSchema.parse({
      id: 'sc-1',
      name: 'Test Scenario',
      description: 'Testing',
      task: { instruction: 'say hello' },
      assertions: {
        files: [{ path: 'greeting.txt', contains: 'Hello' }],
        commands: [{ command: 'cat greeting.txt', expectedExitCode: 0 }],
        trajectory: [{ rule: 'max_turns', param: 10 }],
      },
    });

    const sv = new ScenarioVerifier(scenario, ws, executor);
    const mockTraj: Trajectory = {
      scenarioId: 'sc-1',
      startedAt: new Date().toISOString(),
      durationMs: 100,
      status: 'completed',
      turns: [],
      summary: {
        totalTurns: 0,
        totalToolCalls: 0,
        totalTokens: 0,
        completed: true,
      },
    };

    const report = await sv.verify(mockTraj);
    expect(report.passed).toBe(true);
    expect(report.metrics.passedAssertions).toBe(3);
    expect(report.metrics.failedAssertions).toBe(0);
  });
});

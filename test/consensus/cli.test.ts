import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

describe('CLI consensus Command Integration', () => {
  const createTestTrajectory = (id: string, tool: string, status = 'completed') => ({
    scenarioId: 'cli-consensus-task',
    startedAt: new Date().toISOString(),
    durationMs: 800,
    status,
    turns: [
      {
        turnNumber: 1,
        prompt: 'Run step 1',
        thought: 'Thought 1',
        toolCalls: [
          {
            callId: 'c1',
            toolName: tool,
            arguments: { cmd: 'test' },
            result: { success: status === 'completed', output: 'ok' },
            durationMs: 20,
          },
        ],
        assistantMessage: 'Turn 1 done',
        tokensUsed: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ],
    summary: {
      totalTurns: 1,
      totalToolCalls: 1,
      totalTokens: 15,
      costUsd: 0.0001,
      completed: status === 'completed',
    },
  });

  it('should run consensus CLI with trajectory files and output report and synthesized golden trajectory', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-consensus-cli-test-'));

    const traj1Path = path.join(tmpDir, 'traj1.json');
    const traj2Path = path.join(tmpDir, 'traj2.json');
    const reportPath = path.join(tmpDir, 'consensus-report.json');
    const synthPath = path.join(tmpDir, 'canonical.json');

    await fs.writeFile(traj1Path, JSON.stringify(createTestTrajectory('run-1', 'git_status')), 'utf8');
    await fs.writeFile(traj2Path, JSON.stringify(createTestTrajectory('run-2', 'git_status')), 'utf8');

    const { stdout } = await execFileAsync('node', [
      path.resolve('dist/cli/index.js'),
      'consensus',
      '-t',
      traj1Path,
      traj2Path,
      '-f',
      'json',
      '-o',
      reportPath,
      '-s',
      synthPath,
    ]);

    expect(stdout).toContain('Consensus report written to');
    expect(stdout).toContain('Synthesized canonical trajectory written to');

    const reportContent = await fs.readFile(reportPath, 'utf8');
    const reportJson = JSON.parse(reportContent);
    expect(reportJson.scenarioId).toBe('cli-consensus-task');
    expect(reportJson.metrics.totalTrajectories).toBe(2);
    expect(reportJson.metrics.overallAgreementScore).toBeGreaterThanOrEqual(90);

    const synthContent = await fs.readFile(synthPath, 'utf8');
    const synthJson = JSON.parse(synthContent);
    expect(synthJson.scenarioId).toBe('cli-consensus-task');
    expect(synthJson.turns.length).toBeGreaterThan(0);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should enforce --min-score CI gate and exit 1 when agreement is below threshold', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-consensus-gate-test-'));

    const traj1Path = path.join(tmpDir, 'traj1.json');
    const traj2Path = path.join(tmpDir, 'traj2.json');

    // Completely diverging steps
    await fs.writeFile(traj1Path, JSON.stringify(createTestTrajectory('run-1', 'git_status')), 'utf8');
    await fs.writeFile(traj2Path, JSON.stringify(createTestTrajectory('run-2', 'npm_test')), 'utf8');

    let failed = false;
    try {
      await execFileAsync('node', [
        path.resolve('dist/cli/index.js'),
        'consensus',
        '-t',
        traj1Path,
        traj2Path,
        '--min-score',
        '95',
      ]);
    } catch (err: any) {
      failed = true;
      expect(err.code).toBe(1);
    }

    expect(failed).toBe(true);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

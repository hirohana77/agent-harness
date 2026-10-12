import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

describe('CLI distill Command Integration', () => {
  const sampleTrajectory = {
    scenarioId: 'cli-distill-task',
    startedAt: new Date().toISOString(),
    durationMs: 1500,
    status: 'completed',
    turns: [
      {
        turnNumber: 1,
        prompt: 'Investigate bug',
        thought: 'Search for index error',
        toolCalls: [
          {
            callId: 'c1',
            toolName: 'read_file',
            arguments: { path: 'index.ts' },
            result: { success: true, output: 'const x = 1;' },
            durationMs: 20,
          },
        ],
        assistantMessage: 'Step 1 complete',
        tokensUsed: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
      {
        turnNumber: 2,
        prompt: 'Fix bug',
        thought: 'Write fix',
        toolCalls: [
          {
            callId: 'c2',
            toolName: 'edit_file',
            arguments: { path: 'index.ts', content: 'const x = 2;' },
            result: { success: true, output: 'Updated file' },
            durationMs: 40,
          },
        ],
        assistantMessage: 'Step 2 complete',
        tokensUsed: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
    ],
    summary: {
      totalTurns: 2,
      totalToolCalls: 2,
      totalTokens: 30,
      costUsd: 0.0002,
      completed: true,
    },
  };

  it('should run distill CLI with trajectory and output markdown report and steering rules', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-distill-cli-test-'));

    const trajPath = path.join(tmpDir, 'trajectory.json');
    const reportPath = path.join(tmpDir, 'distilled-report.md');
    const steeringPath = path.join(tmpDir, 'steering-rules.json');

    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), 'utf8');

    const { stdout } = await execFileAsync('node', [
      path.resolve('dist/cli/index.js'),
      'distill',
      '-i',
      trajPath,
      '-f',
      'markdown',
      '-o',
      reportPath,
      '--export-steering',
      steeringPath,
    ]);

    expect(stdout).toContain('Distilled policy guidance written to:');
    expect(stdout).toContain('Steering rules exported to:');

    const reportContent = await fs.readFile(reportPath, 'utf8');
    expect(reportContent).toContain('# Distilled Policy & Prior Guidance Report: `cli-distill-task`');
    expect(reportContent).toContain('read_file');
    expect(reportContent).toContain('edit_file');

    const steeringContent = await fs.readFile(steeringPath, 'utf8');
    const steeringJson = JSON.parse(steeringContent);
    expect(steeringJson.rules).toBeDefined();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should output fewshot json format to stdout when no output file specified', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-distill-stdout-test-'));
    const trajPath = path.join(tmpDir, 'trajectory.json');

    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), 'utf8');

    const { stdout } = await execFileAsync('node', [
      path.resolve('dist/cli/index.js'),
      'distill',
      '-i',
      trajPath,
      '-f',
      'fewshot',
    ]);

    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].role).toBe('system');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

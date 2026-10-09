import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

describe('CLI diff Command Integration', () => {
  it('should run diff CLI and output comparison between two trajectory files', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-diff-test-'));

    const baseTraj = {
      scenarioId: 'cli-test',
      startedAt: new Date().toISOString(),
      durationMs: 1000,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Do task',
          toolCalls: [{ callId: '1', toolName: 'bash', arguments: { cmd: 'ls' }, result: { success: true } }],
          assistantMessage: 'Done',
          tokensUsed: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        },
      ],
      summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 100, costUsd: 0.001, completed: true },
    };

    const candTraj = {
      scenarioId: 'cli-test',
      startedAt: new Date().toISOString(),
      durationMs: 2000,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Do task',
          toolCalls: [{ callId: '1', toolName: 'bash', arguments: { cmd: 'ls -la' }, result: { success: true } }],
          assistantMessage: 'Done detailed',
          tokensUsed: { promptTokens: 70, completionTokens: 60, totalTokens: 130 },
        },
      ],
      summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 130, costUsd: 0.0013, completed: true },
    };

    const basePath = path.join(tmpDir, 'baseline.json');
    const candPath = path.join(tmpDir, 'candidate.json');
    const mdOutPath = path.join(tmpDir, 'diff.md');

    await fs.writeFile(basePath, JSON.stringify(baseTraj), 'utf8');
    await fs.writeFile(candPath, JSON.stringify(candTraj), 'utf8');

    // Test terminal output
    const { stdout } = await execFileAsync('node', [
      path.resolve('dist/cli/index.js'),
      'diff',
      basePath,
      candPath,
      '--format',
      'markdown',
      '--output',
      mdOutPath,
    ]);

    expect(stdout).toContain('Diff report written to');

    const mdContent = await fs.readFile(mdOutPath, 'utf8');
    expect(mdContent).toContain('# Trajectory Differential Analysis: `cli-test`');
    expect(mdContent).toContain('## Metrics Comparison');

    // Clean up
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

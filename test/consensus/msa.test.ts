import { describe, expect, it } from 'vitest';
import { alignMultipleTrajectories } from '../../src/consensus/msa.js';
import { ConsensusOptions } from '../../src/consensus/types.js';
import { Trajectory } from '../../src/core/types.js';

describe('Cluster Consensus Multi-Sequence Alignment (MSA)', () => {
  const defaultOptions: ConsensusOptions = {
    similarityThreshold: 0.6,
    strictArgs: false,
    bottleneckThreshold: 0.8,
    deadEndThreshold: 0.6,
    gapPenalty: -0.5,
    minAgreementRate: 0.5,
  };

  const createTrajectory = (
    id: string,
    toolSequence: Array<{ tool: string; cmd: string; success?: boolean }>,
    status: 'completed' | 'error' = 'completed'
  ): Trajectory => ({
    scenarioId: 'consensus-task',
    startedAt: new Date().toISOString(),
    durationMs: 1000,
    status,
    turns: toolSequence.map((t, idx) => ({
      turnNumber: idx + 1,
      prompt: `Turn ${idx + 1}`,
      thought: `Thinking about ${t.tool}`,
      toolCalls: [
        {
          callId: `call-${idx}`,
          toolName: t.tool,
          arguments: { command: t.cmd },
          result: { success: t.success ?? true, output: 'ok' },
          durationMs: 50,
        },
      ],
      assistantMessage: `Completed turn ${idx + 1}`,
      tokensUsed: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
    })),
    summary: {
      totalTurns: toolSequence.length,
      totalToolCalls: toolSequence.length,
      totalTokens: toolSequence.length * 30,
      costUsd: 0.001,
      completed: status === 'completed',
    },
  });

  it('should handle single trajectory trivially as invariant steps', () => {
    const traj = createTrajectory('run-1', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'read_file', cmd: 'src/main.ts' },
    ]);

    const columns = alignMultipleTrajectories([traj], defaultOptions);
    expect(columns).toHaveLength(4); // 2 tools + 2 turn_ends
    expect(columns.every((c) => c.level === 'invariant')).toBe(true);
    expect(columns.every((c) => c.agreementRate === 1.0)).toBe(true);
  });

  it('should align identical trajectories with 100% agreement', () => {
    const traj1 = createTrajectory('run-1', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'edit_file', cmd: 'patch' },
    ]);
    const traj2 = createTrajectory('run-2', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'edit_file', cmd: 'patch' },
    ]);
    const traj3 = createTrajectory('run-3', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'edit_file', cmd: 'patch' },
    ]);

    const columns = alignMultipleTrajectories([traj1, traj2, traj3], defaultOptions);
    expect(columns.length).toBeGreaterThan(0);
    const toolCols = columns.filter((c) => c.dominantToolName !== undefined);
    expect(toolCols[0].dominantToolName).toBe('bash');
    expect(toolCols[0].level).toBe('invariant');
    expect(toolCols[0].agreementRate).toBe(1.0);

    expect(toolCols[1].dominantToolName).toBe('edit_file');
    expect(toolCols[1].level).toBe('invariant');
  });

  it('should correctly handle inserted exploration steps as minority/outlier gaps', () => {
    // Run 1: bash git status -> edit_file
    const traj1 = createTrajectory('run-1', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'edit_file', cmd: 'fix' },
    ]);
    // Run 2: bash git status -> read_file extra -> edit_file
    const traj2 = createTrajectory('run-2', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'read_file', cmd: 'extra_probe.ts' },
      { tool: 'edit_file', cmd: 'fix' },
    ]);
    // Run 3: bash git status -> edit_file
    const traj3 = createTrajectory('run-3', [
      { tool: 'bash', cmd: 'git status' },
      { tool: 'edit_file', cmd: 'fix' },
    ]);

    const columns = alignMultipleTrajectories([traj1, traj2, traj3], defaultOptions);
    const bashCol = columns.find((c) => c.dominantToolName === 'bash');
    expect(bashCol).toBeDefined();
    expect(bashCol?.agreementRate).toBe(1.0);

    const readFileCol = columns.find((c) => c.dominantToolName === 'read_file');
    expect(readFileCol).toBeDefined();
    expect(readFileCol?.level).toBe('outlier');
    expect(readFileCol?.activeCount).toBe(1);
    expect(readFileCol?.totalCount).toBe(3);

    const editCol = columns.find((c) => c.dominantToolName === 'edit_file');
    expect(editCol).toBeDefined();
    expect(editCol?.agreementRate).toBe(1.0);
  });
});

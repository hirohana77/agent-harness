import { describe, expect, it } from 'vitest';
import { ConsensusAnalyzer } from '../../src/consensus/analyzer.js';
import { alignMultipleTrajectories } from '../../src/consensus/msa.js';
import { ConsensusOptions } from '../../src/consensus/types.js';
import { Trajectory } from '../../src/core/types.js';

describe('ConsensusAnalyzer', () => {
  const options: ConsensusOptions = {
    similarityThreshold: 0.6,
    strictArgs: false,
    bottleneckThreshold: 0.8,
    deadEndThreshold: 0.6,
    gapPenalty: -0.5,
    minAgreementRate: 0.5,
  };

  const createTrajectory = (
    id: string,
    toolSequence: Array<{ tool: string; cmd: string; success?: boolean; error?: string }>,
    status: 'completed' | 'error' = 'completed'
  ): Trajectory => ({
    scenarioId: 'test-analysis-task',
    startedAt: new Date().toISOString(),
    durationMs: 1200,
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
          result: {
            success: t.success ?? (status === 'completed'),
            output: t.success ? 'success' : undefined,
            error: t.error,
          },
          durationMs: 40,
        },
      ],
      assistantMessage: `Turn ${idx + 1} completed`,
      tokensUsed: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
    })),
    summary: {
      totalTurns: toolSequence.length,
      totalToolCalls: toolSequence.length,
      totalTokens: toolSequence.length * 75,
      costUsd: 0.002,
      completed: status === 'completed',
    },
  });

  it('should compute cluster metrics and Shannon entropy accurately', () => {
    const traj1 = createTrajectory('run-1', [
      { tool: 'git_diff', cmd: 'HEAD~1' },
      { tool: 'pytest', cmd: 'tests/' },
    ], 'completed');
    const traj2 = createTrajectory('run-2', [
      { tool: 'git_diff', cmd: 'HEAD~1' },
      { tool: 'pytest', cmd: 'tests/' },
    ], 'completed');
    const traj3 = createTrajectory('run-3', [
      { tool: 'git_diff', cmd: 'HEAD~1' },
      { tool: 'pytest', cmd: 'tests/' },
    ], 'completed');

    const columns = alignMultipleTrajectories([traj1, traj2, traj3], options);
    const { metrics } = ConsensusAnalyzer.analyze(columns, [traj1, traj2, traj3], options);

    expect(metrics.totalTrajectories).toBe(3);
    expect(metrics.successfulTrajectories).toBe(3);
    expect(metrics.failedTrajectories).toBe(0);
    expect(metrics.successRate).toBe(1.0);
    expect(metrics.overallAgreementScore).toBeGreaterThanOrEqual(90);
    expect(metrics.invariantStepsCount).toBeGreaterThan(0);
    expect(metrics.outlierStepsCount).toBe(0);
    expect(metrics.pathDiversityEntropy).toBe(0); // identical paths have 0 entropy
  });

  it('should detect bottlenecks on checkpoints traversed by successful agents', () => {
    // 2 successful runs pass both git_diff and pytest
    const traj1 = createTrajectory('run-1', [
      { tool: 'git_diff', cmd: 'HEAD~1' },
      { tool: 'pytest', cmd: 'tests/' },
    ], 'completed');
    const traj2 = createTrajectory('run-2', [
      { tool: 'git_diff', cmd: 'HEAD~1' },
      { tool: 'pytest', cmd: 'tests/' },
    ], 'completed');
    // 1 failed run fails at rm_rf and never reaches pytest
    const traj3 = createTrajectory('run-3', [
      { tool: 'rm_rf', cmd: '/root', success: false, error: 'Permission denied' },
    ], 'error');

    const columns = alignMultipleTrajectories([traj1, traj2, traj3], options);
    const { bottlenecks, deadEnds } = ConsensusAnalyzer.analyze(
      columns,
      [traj1, traj2, traj3],
      options
    );

    // git_diff was executed by successful runs
    expect(bottlenecks.length).toBeGreaterThan(0);
    const gitDiffBottleneck = bottlenecks.find((b) => b.step.toolName === 'git_diff');
    expect(gitDiffBottleneck).toBeDefined();

    // rm_rf was executed by failed run and caused error
    expect(deadEnds.length).toBeGreaterThan(0);
    const rmTrap = deadEnds.find((d) => d.step.toolName === 'rm_rf');
    expect(rmTrap).toBeDefined();
    expect(rmTrap?.failureRate).toBe(1.0);
    expect(rmTrap?.errorDetails).toContain('Permission denied');
  });
});

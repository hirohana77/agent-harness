import { describe, expect, it } from 'vitest';
import {
  TerminalConsensusReporter,
  MarkdownConsensusReporter,
  JsonConsensusReporter,
  renderConsensusReport,
} from '../../src/consensus/reporters/index.js';
import { ClusterConsensusResult } from '../../src/consensus/types.js';

describe('Consensus Reporters', () => {
  const mockResult: ClusterConsensusResult = {
    scenarioId: 'benchmark-task-01',
    metrics: {
      totalTrajectories: 3,
      successfulTrajectories: 2,
      failedTrajectories: 1,
      successRate: 0.67,
      averageTurns: 3,
      averageTokens: 350,
      averageDurationMs: 1200,
      overallAgreementScore: 84.5,
      pathDiversityEntropy: 0.42,
      alignmentColumnsCount: 4,
      invariantStepsCount: 2,
      majorityStepsCount: 1,
      minorityStepsCount: 0,
      outlierStepsCount: 1,
    },
    alignmentColumns: [
      {
        columnIndex: 0,
        slots: [
          { trajectoryId: 't1', stepIndex: 0, gap: false },
          { trajectoryId: 't2', stepIndex: 0, gap: false },
          { trajectoryId: 't3', stepIndex: 0, gap: false },
        ],
        consensusStep: {
          turnNumber: 1,
          stepIndex: 0,
          stepType: 'tool',
          toolName: 'git_status',
        },
        agreementRate: 1.0,
        level: 'invariant',
        dominantToolName: 'git_status',
        isBottleneck: true,
        isTrap: false,
        activeCount: 3,
        totalCount: 3,
      },
      {
        columnIndex: 1,
        slots: [
          { trajectoryId: 't1', gap: true },
          { trajectoryId: 't2', gap: true },
          { trajectoryId: 't3', stepIndex: 1, gap: false },
        ],
        consensusStep: {
          turnNumber: 1,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'rm_rf',
        },
        agreementRate: 0.33,
        level: 'outlier',
        dominantToolName: 'rm_rf',
        isBottleneck: false,
        isTrap: true,
        activeCount: 1,
        totalCount: 3,
      },
    ],
    bottlenecks: [
      {
        columnIndex: 0,
        step: {
          turnNumber: 1,
          stepIndex: 0,
          stepType: 'tool',
          toolName: 'git_status',
        },
        frequency: 1.0,
        successCorrelation: 0.5,
        description: 'Key checkpoint step passed by all runs',
      },
    ],
    deadEnds: [
      {
        columnIndex: 1,
        step: {
          turnNumber: 1,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'rm_rf',
        },
        failureRate: 1.0,
        affectedTrajectories: ['t3'],
        errorDetails: ['Access Denied'],
      },
    ],
    canonicalTrajectory: {
      scenarioId: 'benchmark-task-01',
      description: 'Canonical golden path',
      confidenceScore: 92.5,
      synthesizedFromCount: 3,
      prunedOutlierStepsCount: 1,
      turns: [
        {
          turnNumber: 1,
          thought: 'Initial inspect',
          toolCalls: [{ toolName: 'git_status', arguments: {} }],
          assistantMessage: 'Inspected git state',
        },
      ],
      totalSteps: 1,
    },
    trajectories: [
      { id: 't1', status: 'completed', turnsCount: 3, tokens: 300, durationMs: 1000 },
      { id: 't2', status: 'completed', turnsCount: 3, tokens: 320, durationMs: 1100 },
      { id: 't3', status: 'error', turnsCount: 3, tokens: 430, durationMs: 1500 },
    ],
  };

  it('TerminalConsensusReporter should render ANSI formatted text with highlights', () => {
    const output = TerminalConsensusReporter.render(mockResult);
    expect(output).toContain('CLUSTER TRAJECTORY CONSENSUS REPORT');
    expect(output).toContain('benchmark-task-01');
    expect(output).toContain('84.5 / 100');
    expect(output).toContain('git_status');
    expect(output).toContain('rm_rf');
    expect(output).toContain('CHECKPOINT');
  });

  it('MarkdownConsensusReporter should render valid GitHub markdown tables', () => {
    const output = MarkdownConsensusReporter.render(mockResult);
    expect(output).toContain('# Cluster Trajectory Consensus Report: `benchmark-task-01`');
    expect(output).toContain('| **Consensus Score** |');
    expect(output).toContain('| `git_status` |');
    expect(output).toContain('| `rm_rf` |');
    expect(output).toContain('★ Checkpoint');
  });

  it('JsonConsensusReporter should render valid parseable JSON', () => {
    const jsonStr = JsonConsensusReporter.render(mockResult);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.scenarioId).toBe('benchmark-task-01');
    expect(parsed.metrics.overallAgreementScore).toBe(84.5);
    expect(parsed.canonicalTrajectory.confidenceScore).toBe(92.5);
  });

  it('renderConsensusReport should delegate to requested format', () => {
    expect(renderConsensusReport(mockResult, 'terminal')).toContain('CLUSTER TRAJECTORY CONSENSUS REPORT');
    expect(renderConsensusReport(mockResult, 'markdown')).toContain('# Cluster Trajectory Consensus Report');
    expect(JSON.parse(renderConsensusReport(mockResult, 'json')).scenarioId).toBe('benchmark-task-01');
  });
});

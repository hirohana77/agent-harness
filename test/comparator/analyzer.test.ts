import { describe, expect, it } from 'vitest';
import {
  detectAnomalies,
  evaluateRegression,
  findDivergences,
} from '../../src/comparator/analyzer.js';
import { AlignedStep } from '../../src/comparator/types.js';
import { Trajectory } from '../../src/core/types.js';

describe('Trajectory Analyzer & Regression Evaluation', () => {
  const createBaseTrajectory = (overrides?: Partial<Trajectory>): Trajectory => ({
    scenarioId: 'test-scenario',
    startedAt: new Date().toISOString(),
    status: 'completed',
    durationMs: 1000,
    turns: [
      {
        turnNumber: 1,
        prompt: 'Task 1',
        toolCalls: [
          {
            callId: 'c1',
            toolName: 'execute_command',
            arguments: { cmd: 'git status' },
            result: { success: true },
          },
        ],
        assistantMessage: 'Clean',
        tokensUsed: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
    ],
    summary: {
      totalTurns: 1,
      totalToolCalls: 1,
      totalTokens: 150,
      costUsd: 0.005,
      completed: true,
    },
    ...overrides,
  });

  it('should detect tool invocation loop anomaly', () => {
    const baseline = createBaseTrajectory();
    const candidate = createBaseTrajectory({
      turns: [
        {
          turnNumber: 1,
          prompt: 'Retry',
          toolCalls: [
            { callId: '1', toolName: 'bash', arguments: { cmd: 'cat file.txt' }, result: { success: false } },
            { callId: '2', toolName: 'bash', arguments: { cmd: 'cat file.txt' }, result: { success: false } },
            { callId: '3', toolName: 'bash', arguments: { cmd: 'cat file.txt' }, result: { success: false } },
          ],
        },
      ],
    });

    const anomalies = detectAnomalies(baseline, candidate);
    expect(anomalies.some((a) => a.type === 'loop_detected')).toBe(true);
    const loop = anomalies.find((a) => a.type === 'loop_detected');
    expect(loop?.message).toContain('bash');
  });

  it('should detect tool execution error spikes', () => {
    const baseline = createBaseTrajectory();
    const candidate = createBaseTrajectory({
      turns: [
        {
          turnNumber: 1,
          prompt: 'Run tools',
          toolCalls: [
            { callId: '1', toolName: 'bash', arguments: { cmd: 'a' }, result: { success: false, error: 'err1' } },
            { callId: '2', toolName: 'bash', arguments: { cmd: 'b' }, result: { success: false, error: 'err2' } },
          ],
        },
      ],
    });

    const anomalies = detectAnomalies(baseline, candidate);
    expect(anomalies.some((a) => a.type === 'error_spike')).toBe(true);
  });

  it('should detect token consumption explosion', () => {
    const baseline = createBaseTrajectory({
      summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 1000, costUsd: 0.01, completed: true },
    });
    const candidate = createBaseTrajectory({
      summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 2500, costUsd: 0.025, completed: true },
    });

    const anomalies = detectAnomalies(baseline, candidate, {
      tokenRegressionRatio: 0.5,
      strictArgs: false,
      minSimilarityThreshold: 0.6,
      maxAcceptableDivergences: 2,
      failOnRegression: false,
    });
    expect(anomalies.some((a) => a.type === 'token_explosion')).toBe(true);
  });

  it('should detect empty turns', () => {
    const baseline = createBaseTrajectory();
    const candidate = createBaseTrajectory({
      turns: [
        {
          turnNumber: 1,
          prompt: 'Do nothing',
          toolCalls: [],
          assistantMessage: '',
        },
      ],
    });

    const anomalies = detectAnomalies(baseline, candidate);
    expect(anomalies.some((a) => a.type === 'empty_turn')).toBe(true);
  });

  it('should detect premature rapid failure', () => {
    const baseline = createBaseTrajectory();
    const candidate = createBaseTrajectory({
      status: 'error',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Fail immediately',
          toolCalls: [],
        },
      ],
    });

    const anomalies = detectAnomalies(baseline, candidate);
    expect(anomalies.some((a) => a.type === 'rapid_failure')).toBe(true);
  });

  it('should identify first divergence point accurately', () => {
    const baseline = createBaseTrajectory();
    const candidate = createBaseTrajectory();

    const alignment: AlignedStep[] = [
      {
        stepIndex: 0,
        alignmentType: 'match',
        similarity: 1.0,
      },
      {
        stepIndex: 1,
        alignmentType: 'modified',
        similarity: 0.5,
        baselineStep: {
          turnNumber: 1,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'read_file',
          result: { success: true },
        },
        candidateStep: {
          turnNumber: 1,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'read_file',
          result: { success: false, error: 'File not found' },
        },
      },
    ];

    const { firstDivergence, allDivergences } = findDivergences(alignment, baseline, candidate);
    expect(firstDivergence).toBeDefined();
    expect(firstDivergence?.type).toBe('tool_failure');
    expect(allDivergences).toHaveLength(1);
  });

  it('should evaluate regression severity as identical when perfect match', () => {
    const baseline = createBaseTrajectory();
    const candidate = createBaseTrajectory();
    const alignment: AlignedStep[] = [
      { stepIndex: 0, alignmentType: 'match', similarity: 1.0 },
    ];

    const result = evaluateRegression(baseline, candidate, alignment, [], []);
    expect(result.severity).toBe('identical');
    expect(result.score).toBe(1.0);
    expect(result.isRegression).toBe(false);
  });

  it('should flag isRegression true when status regresses from completed to error', () => {
    const baseline = createBaseTrajectory({ status: 'completed' });
    const candidate = createBaseTrajectory({ status: 'error' });
    const alignment: AlignedStep[] = [];

    const result = evaluateRegression(baseline, candidate, alignment, [], []);
    expect(result.isRegression).toBe(true);
    expect(['regression', 'critical_failure']).toContain(result.severity);
  });
});

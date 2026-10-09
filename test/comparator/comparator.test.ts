import { describe, expect, it } from 'vitest';
import { TrajectoryComparator } from '../../src/comparator/comparator.js';
import { TrajectoryDiffSchema, ReportDiffSchema } from '../../src/comparator/schemas.js';
import { HarnessReport, Trajectory } from '../../src/core/types.js';

describe('TrajectoryComparator Integration Tests', () => {
  const baseTrajectory: Trajectory = {
    scenarioId: 'swe-fix-issue',
    startedAt: '2026-10-10T00:00:00.000Z',
    completedAt: '2026-10-10T00:01:00.000Z',
    durationMs: 60000,
    status: 'completed',
    turns: [
      {
        turnNumber: 1,
        prompt: 'Inspect bug in auth.py',
        thought: 'Let us view the file first',
        toolCalls: [
          {
            callId: 'call_1',
            toolName: 'read_file',
            arguments: { path: 'auth.py' },
            result: { success: true, output: 'def check(): pass' },
            durationMs: 120,
          },
        ],
        assistantMessage: 'Inspected auth.py, moving to edit.',
        tokensUsed: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
      },
      {
        turnNumber: 2,
        prompt: 'Apply bug fix',
        thought: 'Replacing bug',
        toolCalls: [
          {
            callId: 'call_2',
            toolName: 'write_file',
            arguments: { path: 'auth.py', content: 'def check(): return True' },
            result: { success: true, output: 'Wrote 26 bytes' },
            durationMs: 150,
          },
          {
            callId: 'call_3',
            toolName: 'execute_command',
            arguments: { cmd: 'pytest tests/' },
            result: { success: true, output: '1 passed' },
            durationMs: 1200,
          },
        ],
        assistantMessage: 'Fix verified by pytest.',
        tokensUsed: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
      },
    ],
    summary: {
      totalTurns: 2,
      totalToolCalls: 3,
      totalTokens: 1100,
      costUsd: 0.015,
      completed: true,
    },
  };

  it('should accurately compare identical trajectories', () => {
    const diff = TrajectoryComparator.compare(baseTrajectory, baseTrajectory);

    // Schema validation
    expect(() => TrajectoryDiffSchema.parse(diff)).not.toThrow();

    expect(diff.summary.turns.delta).toBe(0);
    expect(diff.summary.toolCalls.delta).toBe(0);
    expect(diff.summary.tokens.totalDelta).toBe(0);
    expect(diff.firstDivergence).toBeUndefined();
    expect(diff.regression.severity).toBe('identical');
    expect(diff.regression.isRegression).toBe(false);
    expect(diff.toolDistribution['read_file']).toEqual({ baseline: 1, candidate: 1, delta: 0 });
    expect(diff.toolDistribution['write_file']).toEqual({ baseline: 1, candidate: 1, delta: 0 });
    expect(diff.toolDistribution['execute_command']).toEqual({ baseline: 1, candidate: 1, delta: 0 });
  });

  it('should detect divergence and regressions in modified candidate trajectory', () => {
    const candidateTrajectory: Trajectory = {
      scenarioId: 'swe-fix-issue',
      startedAt: '2026-10-10T00:00:00.000Z',
      completedAt: '2026-10-10T00:01:30.000Z',
      durationMs: 90000,
      status: 'error',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Inspect bug in auth.py',
          toolCalls: [
            {
              callId: 'cand_1',
              toolName: 'read_file',
              arguments: { path: 'auth.py' },
              result: { success: true, output: 'def check(): pass' },
              durationMs: 100,
            },
          ],
          tokensUsed: { promptTokens: 400, completionTokens: 150, totalTokens: 550 },
        },
        {
          turnNumber: 2,
          prompt: 'Apply bug fix',
          toolCalls: [
            {
              callId: 'cand_2',
              toolName: 'write_file',
              arguments: { path: 'wrong_file.py', content: 'invalid' },
              result: { success: false, error: 'Permission denied' },
              durationMs: 80,
            },
          ],
          tokensUsed: { promptTokens: 600, completionTokens: 300, totalTokens: 900 },
        },
      ],
      summary: {
        totalTurns: 2,
        totalToolCalls: 2,
        totalTokens: 1450,
        costUsd: 0.022,
        completed: false,
      },
    };

    const diff = TrajectoryComparator.compare(baseTrajectory, candidateTrajectory);

    expect(() => TrajectoryDiffSchema.parse(diff)).not.toThrow();

    expect(diff.summary.status.regressed).toBe(true);
    expect(diff.summary.tokens.totalDelta).toBe(350);
    expect(diff.summary.toolCalls.delta).toBe(-1);
    expect(diff.firstDivergence).toBeDefined();
    expect(diff.regression.isRegression).toBe(true);
    expect(['regression', 'critical_failure']).toContain(diff.regression.severity);
  });

  it('should compare HarnessReports and detect regressions in assertions', () => {
    const baselineReport: HarnessReport = {
      scenarioId: 'swe-fix-issue',
      scenarioName: 'SWE Fix Issue Scenario',
      timestamp: new Date().toISOString(),
      passed: true,
      metrics: {
        durationMs: 60000,
        totalTurns: 2,
        totalAssertions: 2,
        passedAssertions: 2,
        failedAssertions: 0,
        totalTokens: 1100,
        costUsd: 0.015,
      },
      assertionResults: [
        { type: 'file', target: 'auth.py', passed: true, message: 'File contains fix' },
        { type: 'command', target: 'pytest tests/', passed: true, message: 'Tests passed' },
      ],
      trajectorySummary: baseTrajectory.summary,
    };

    const candidateReport: HarnessReport = {
      scenarioId: 'swe-fix-issue',
      scenarioName: 'SWE Fix Issue Scenario',
      timestamp: new Date().toISOString(),
      passed: false,
      metrics: {
        durationMs: 90000,
        totalTurns: 2,
        totalAssertions: 2,
        passedAssertions: 1,
        failedAssertions: 1,
        totalTokens: 1450,
        costUsd: 0.022,
      },
      assertionResults: [
        { type: 'file', target: 'auth.py', passed: true, message: 'File contains fix' },
        { type: 'command', target: 'pytest tests/', passed: false, message: '1 failed' },
      ],
      trajectorySummary: {
        totalTurns: 2,
        totalToolCalls: 2,
        totalTokens: 1450,
        costUsd: 0.022,
        completed: false,
      },
    };

    const reportDiff = TrajectoryComparator.compareReports(
      baselineReport,
      candidateReport,
      baseTrajectory,
      baseTrajectory // attach identical or candidate
    );

    expect(() => ReportDiffSchema.parse(reportDiff)).not.toThrow();
    expect(reportDiff.baselinePassed).toBe(true);
    expect(reportDiff.candidatePassed).toBe(false);
    expect(reportDiff.isRegression).toBe(true);

    const cmdAssertion = reportDiff.assertions.find((a) => a.target === 'pytest tests/');
    expect(cmdAssertion?.status).toBe('regression');

    const fileAssertion = reportDiff.assertions.find((a) => a.target === 'auth.py');
    expect(fileAssertion?.status).toBe('maintained_pass');
  });
});

  it('should evaluate regression when candidate exceeds token threshold and has anomalies', () => {
    const base: Trajectory = {
      scenarioId: 'scen-1',
      startedAt: new Date().toISOString(),
      durationMs: 1000,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Do task',
          toolCalls: [{ callId: '1', toolName: 'bash', arguments: { cmd: 'ls' }, result: { success: true } }],
          tokensUsed: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        },
      ],
      summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 150, costUsd: 0.001, completed: true },
    };

    const cand: Trajectory = {
      scenarioId: 'scen-1',
      startedAt: new Date().toISOString(),
      durationMs: 5000,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Do task',
          toolCalls: [
            { callId: '1', toolName: 'bash', arguments: { cmd: 'ls' }, result: { success: true } },
            { callId: '2', toolName: 'bash', arguments: { cmd: 'cat x' }, result: { success: false, error: 'err1' } },
            { callId: '3', toolName: 'bash', arguments: { cmd: 'cat y' }, result: { success: false, error: 'err2' } },
          ],
          tokensUsed: { promptTokens: 1000, completionTokens: 800, totalTokens: 1800 },
        },
      ],
      summary: { totalTurns: 1, totalToolCalls: 3, totalTokens: 1800, costUsd: 0.02, completed: true },
    };

    const diff = TrajectoryComparator.compare(base, cand, {
      tokenRegressionRatio: 0.5,
    });

    expect(diff.regression.anomalies.length).toBeGreaterThan(0);
    expect(diff.regression.anomalies.some((a) => a.type === 'token_explosion')).toBe(true);
    expect(diff.regression.anomalies.some((a) => a.type === 'error_spike')).toBe(true);
    expect(diff.regression.isRegression).toBe(true);
  });

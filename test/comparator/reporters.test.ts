import { describe, expect, it } from 'vitest';
import { TrajectoryComparator } from '../../src/comparator/comparator.js';
import {
  HtmlDiffReporter,
  JsonDiffReporter,
  MarkdownDiffReporter,
  renderTrajectoryDiff,
  TerminalDiffReporter,
} from '../../src/comparator/reporters/index.js';
import { Trajectory } from '../../src/core/types.js';

describe('Trajectory Diff Reporters', () => {
  const baseline: Trajectory = {
    scenarioId: 'scen-reporter-test',
    startedAt: '2026-10-10T00:00:00.000Z',
    status: 'completed',
    durationMs: 5000,
    turns: [
      {
        turnNumber: 1,
        prompt: 'Check files',
        toolCalls: [
          { callId: '1', toolName: 'bash', arguments: { cmd: 'ls -la' }, result: { success: true } },
        ],
        assistantMessage: 'Files found',
        tokensUsed: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      },
    ],
    summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 150, costUsd: 0.002, completed: true },
  };

  const candidate: Trajectory = {
    scenarioId: 'scen-reporter-test',
    startedAt: '2026-10-10T00:00:00.000Z',
    status: 'error',
    durationMs: 8000,
    turns: [
      {
        turnNumber: 1,
        prompt: 'Check files',
        toolCalls: [
          { callId: '1', toolName: 'bash', arguments: { cmd: 'dir' }, result: { success: false, error: 'Command failed' } },
        ],
        assistantMessage: 'Files missing',
        tokensUsed: { promptTokens: 300, completionTokens: 150, totalTokens: 450 },
      },
    ],
    summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 450, costUsd: 0.006, completed: false },
  };

  const diff = TrajectoryComparator.compare(baseline, candidate);

  it('TerminalDiffReporter should render ANSI colored text with metrics and steps', () => {
    const output = TerminalDiffReporter.render(diff);
    expect(output).toContain('TRAJECTORY DIFFERENTIAL ANALYSIS');
    expect(output).toContain('scen-reporter-test');
    expect(output).toContain('Metric Comparison:');
    expect(output).toContain('Aligned Step Trajectory:');
  });

  it('MarkdownDiffReporter should render markdown tables and badges', () => {
    const output = MarkdownDiffReporter.render(diff);
    expect(output).toContain('# Trajectory Differential Analysis: `scen-reporter-test`');
    expect(output).toContain('## Metrics Comparison');
    expect(output).toContain('| **Turns** |');
    expect(output).toContain('## Aligned Trajectory Steps');
  });

  it('HtmlDiffReporter should render HTML document with dark theme cards and styles', () => {
    const output = HtmlDiffReporter.render(diff);
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('Trajectory Diff: scen-reporter-test');
    expect(output).toContain('class="metric-value"');
    expect(output).toContain('class="card"');
  });

  it('JsonDiffReporter should serialize valid JSON', () => {
    const output = JsonDiffReporter.render(diff);
    const parsed = JSON.parse(output);
    expect(parsed.scenarioId).toBe('scen-reporter-test');
    expect(parsed.summary).toBeDefined();
    expect(parsed.alignment).toBeDefined();
  });

  it('renderTrajectoryDiff should dispatch correctly to all formats', () => {
    expect(renderTrajectoryDiff(diff, 'terminal')).toContain('scen-reporter-test');
    expect(renderTrajectoryDiff(diff, 'markdown')).toContain('scen-reporter-test');
    expect(renderTrajectoryDiff(diff, 'html')).toContain('scen-reporter-test');
    expect(renderTrajectoryDiff(diff, 'json')).toContain('scen-reporter-test');
  });
});

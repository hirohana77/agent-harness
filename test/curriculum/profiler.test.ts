import { describe, expect, it } from 'vitest';
import { WeaknessProfiler } from '../../src/curriculum/profiler.js';
import { HarnessReport } from '../../src/core/types.js';

describe('WeaknessProfiler', () => {
  it('correctly profiles passed reports with 0 weaknesses', () => {
    const passedReport: HarnessReport = {
      scenarioId: 'test-1',
      scenarioName: 'Test 1',
      timestamp: new Date().toISOString(),
      passed: true,
      metrics: {
        durationMs: 1200,
        totalTurns: 3,
        totalTokens: 1500,
        totalCostUsd: 0.002,
        totalAssertions: 3,
        passedAssertions: 3,
        failedAssertions: 0,
      },
      assertionResults: [
        { type: 'file', target: 'src/index.js', passed: true, message: 'File exists' },
      ],
    };

    const profile = WeaknessProfiler.profileReports([passedReport]);
    expect(profile.totalEvaluated).toBe(1);
    expect(profile.failureCount).toBe(0);
    expect(profile.criticalWeaknesses).toEqual([]);
    expect(profile.recommendedCurriculumStages).toContain('advanced');
  });

  it('detects multiple weakness categories from failing assertion reports', () => {
    const failingReports: HarnessReport[] = [
      {
        scenarioId: 'ast-failure',
        scenarioName: 'AST Failure Scenario',
        timestamp: new Date().toISOString(),
        passed: false,
        metrics: {
          durationMs: 3400,
          totalTurns: 4,
          totalTokens: 2500,
          totalCostUsd: 0.005,
          totalAssertions: 2,
          passedAssertions: 1,
          failedAssertions: 1,
        },
        assertionResults: [
          {
            type: 'ast',
            target: 'src/calc.js',
            passed: false,
            message: 'AST rule failed: function add missing expected parameter count',
          },
        ],
      },
      {
        scenarioId: 'security-and-budget-failure',
        scenarioName: 'Security & Budget Scenario',
        timestamp: new Date().toISOString(),
        passed: false,
        metrics: {
          durationMs: 15000,
          totalTurns: 10,
          totalTokens: 8000,
          totalCostUsd: 0.02,
          totalAssertions: 3,
          passedAssertions: 1,
          failedAssertions: 2,
        },
        assertionResults: [
          {
            type: 'trajectory',
            target: 'security',
            passed: false,
            message: 'Security violation: attempted forbidden rm -rf /',
          },
          {
            type: 'trajectory',
            target: 'turns',
            passed: false,
            message: 'max_turns budget exceeded limit of 10',
          },
        ],
      },
      {
        scenarioId: 'command-and-file-failure',
        scenarioName: 'Command and File Scenario',
        timestamp: new Date().toISOString(),
        passed: false,
        metrics: {
          durationMs: 4000,
          totalTurns: 5,
          totalTokens: 3000,
          totalCostUsd: 0.006,
          totalAssertions: 2,
          passedAssertions: 0,
          failedAssertions: 2,
        },
        assertionResults: [
          {
            type: 'command',
            target: 'npm test',
            passed: false,
            message: 'Command exited with status code 1',
          },
          {
            type: 'file',
            target: 'README.md',
            passed: false,
            message: 'File does not exist: README.md',
          },
        ],
      },
    ];

    const profile = WeaknessProfiler.profileReports(failingReports);
    expect(profile.totalEvaluated).toBe(3);
    expect(profile.failureCount).toBe(3);
    expect(profile.categoryOccurrences.ast_syntax_error).toBeGreaterThanOrEqual(1);
    expect(profile.categoryOccurrences.security_violation).toBeGreaterThanOrEqual(1);
    expect(profile.categoryOccurrences.budget_exhaustion).toBeGreaterThanOrEqual(1);
    expect(profile.categoryOccurrences.command_flakiness).toBeGreaterThanOrEqual(1);
    expect(profile.categoryOccurrences.file_integrity).toBeGreaterThanOrEqual(1);

    expect(profile.criticalWeaknesses.length).toBeGreaterThan(0);
    // Since failure rate is 100%, recommended stages should start at novice
    expect(profile.recommendedCurriculumStages).toContain('novice');
  });
});

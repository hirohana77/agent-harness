import { describe, expect, it } from 'vitest';
import {
  TerminalCurriculumReporter,
  MarkdownCurriculumReporter,
  JsonCurriculumReporter,
  renderCurriculumReport,
} from '../../src/curriculum/reporters/index.js';
import type { CurriculumResult } from '../../src/curriculum/types.js';

describe('Curriculum Reporters', () => {
  const sampleResult: CurriculumResult = {
    curriculumId: 'curriculum_calc_101',
    curriculumName: 'Calculator Mastery Ladder',
    passed: true,
    completedStages: 2,
    totalStages: 2,
    initialCompetency: 1000,
    finalCompetency: 1120,
    competencyDelta: 120,
    stages: [
      {
        stageId: 'stage_novice',
        stageName: 'Stage 1: Novice Mastery',
        difficulty: 'novice',
        passed: true,
        passRate: 1.0,
        totalScenarios: 2,
        passedScenarios: 2,
        durationMs: 2500,
        tokensUsed: 1200,
        costUsd: 0.0024,
        guidanceInjected: false,
        scenarioResults: [
          {
            scenarioId: 'sc-1',
            scenarioName: 'Basic Addition',
            passed: true,
            tokens: 600,
            durationMs: 1200,
            costUsd: 0.0012,
          },
          {
            scenarioId: 'sc-2',
            scenarioName: 'Negative Number Handling',
            passed: true,
            tokens: 600,
            durationMs: 1300,
            costUsd: 0.0012,
          },
        ],
      },
      {
        stageId: 'stage_intermediate',
        stageName: 'Stage 2: Intermediate Mastery',
        difficulty: 'intermediate',
        passed: true,
        passRate: 0.8,
        totalScenarios: 2,
        passedScenarios: 2,
        durationMs: 3800,
        tokensUsed: 2100,
        costUsd: 0.0042,
        guidanceInjected: true,
        scenarioResults: [
          {
            scenarioId: 'sc-3',
            scenarioName: 'Floating Point Precision',
            passed: true,
            tokens: 1100,
            durationMs: 1900,
            costUsd: 0.0022,
          },
          {
            scenarioId: 'sc-4',
            scenarioName: 'Complex Operations',
            passed: true,
            tokens: 1000,
            durationMs: 1900,
            costUsd: 0.002,
          },
        ],
      },
    ],
    remediationMetrics: {
      baselinePassRate: 0.75,
      guidedPassRate: 1.0,
      guidanceUpliftPercent: 33.3,
      weaknessRemediations: {
        ast_syntax_error: {
          beforeFailureRate: 0.25,
          afterFailureRate: 0.0,
          remediated: true,
        },
        security_violation: {
          beforeFailureRate: 0.0,
          afterFailureRate: 0.0,
          remediated: true,
        },
        infinite_loop: {
          beforeFailureRate: 0.0,
          afterFailureRate: 0.0,
          remediated: true,
        },
        budget_exhaustion: {
          beforeFailureRate: 0.0,
          afterFailureRate: 0.0,
          remediated: true,
        },
        command_flakiness: {
          beforeFailureRate: 0.0,
          afterFailureRate: 0.0,
          remediated: true,
        },
        file_integrity: {
          beforeFailureRate: 0.0,
          afterFailureRate: 0.0,
          remediated: true,
        },
        tool_format_error: {
          beforeFailureRate: 0.0,
          afterFailureRate: 0.0,
          remediated: true,
        },
      },
    },
    totalDurationMs: 6300,
    totalTokens: 3300,
    totalCostUsd: 0.0066,
  };

  it('TerminalCurriculumReporter renders visual ANSI report', () => {
    const rendered = TerminalCurriculumReporter.render(sampleResult);
    expect(rendered).toContain('AUTO-CURRICULUM CLOSED-LOOP REPORT');
    expect(rendered).toContain('Calculator Mastery Ladder');
    expect(rendered).toContain('CURRICULUM GRADUATED');
    expect(rendered).toContain('1000');
    expect(rendered).toContain('1120');
    expect(rendered).toContain('Stage 1: Novice Mastery');
    expect(rendered).toContain('ast_syntax_error');
    expect(rendered).toContain('REMEDIATED');
  });

  it('MarkdownCurriculumReporter renders markdown tables and sections', () => {
    const rendered = MarkdownCurriculumReporter.render(sampleResult);
    expect(rendered).toContain('# Auto-Curriculum Closed-Loop Report: Calculator Mastery Ladder');
    expect(rendered).toContain('| Stage | Difficulty | Guidance | Pass Rate |');
    expect(rendered).toContain('`novice`');
    expect(rendered).toContain('`intermediate`');
    expect(rendered).toContain('## Weakness Remediation & Guidance Uplift');
    expect(rendered).toContain('**+33.3%**');
    expect(rendered).toContain('`ast_syntax_error`');
  });

  it('JsonCurriculumReporter and renderCurriculumReport dispatch formats correctly', () => {
    const jsonOutput = JsonCurriculumReporter.render(sampleResult);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.curriculumId).toBe('curriculum_calc_101');
    expect(parsed.finalCompetency).toBe(1120);

    const termOutput = renderCurriculumReport(sampleResult, 'terminal');
    expect(termOutput).toContain('Calculator Mastery Ladder');

    const mdOutput = renderCurriculumReport(sampleResult, 'markdown');
    expect(mdOutput).toContain('# Auto-Curriculum Closed-Loop Report');
  });
});

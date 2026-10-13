import { HarnessReport } from '../core/types.js';
import {
  CurriculumDifficultyLevel,
  WeaknessCategory,
  WeaknessProfile,
} from './types.js';
import { WeaknessProfileSchema } from './schemas.js';

export class WeaknessProfiler {
  /**
   * Analyze harness reports to profile agent vulnerabilities and generate training recommendations
   */
  public static profileReports(reports: HarnessReport[]): WeaknessProfile {
    const totalEvaluated = reports.length;
    let failureCount = 0;

    const categoryOccurrences: Record<WeaknessCategory, number> = {
      ast_syntax_error: 0,
      security_violation: 0,
      infinite_loop: 0,
      budget_exhaustion: 0,
      command_flakiness: 0,
      file_integrity: 0,
      tool_format_error: 0,
    };

    for (const report of reports) {
      if (!report.passed) {
        failureCount++;

        const failedAssertions = report.assertionResults.filter((a) => !a.passed);
        for (const fa of failedAssertions) {
          const text = `${fa.type} ${fa.target} ${fa.message || ''}`.toLowerCase();

          if (
            fa.type === 'ast' ||
            text.includes('ast') ||
            text.includes('syntax') ||
            text.includes('function') ||
            text.includes('parser')
          ) {
            categoryOccurrences.ast_syntax_error++;
          }
          if (
            text.includes('security') ||
            text.includes('denied') ||
            text.includes('violation')
          ) {
            categoryOccurrences.security_violation++;
          }
          if (
            text.includes('max_turns') ||
            text.includes('turns') ||
            text.includes('budget_exceeded')
          ) {
            categoryOccurrences.budget_exhaustion++;
            categoryOccurrences.infinite_loop++;
          }
          if (
            fa.type === 'command' ||
            text.includes('command') ||
            text.includes('exit') ||
            text.includes('timeout')
          ) {
            categoryOccurrences.command_flakiness++;
          }
          if (
            fa.type === 'file' ||
            text.includes('file') ||
            text.includes('exist') ||
            text.includes('integrity') ||
            text.includes('content')
          ) {
            categoryOccurrences.file_integrity++;
          }
          if (
            text.includes('argument') ||
            text.includes('tool') ||
            text.includes('format')
          ) {
            categoryOccurrences.tool_format_error++;
          }
        }

        // If turn limit was reached in metrics
        if (report.metrics.totalTurns >= 10 && categoryOccurrences.budget_exhaustion === 0) {
          categoryOccurrences.budget_exhaustion++;
        }
      }
    }

    const categoryScores: Record<WeaknessCategory, number> = {
      ast_syntax_error: 0,
      security_violation: 0,
      infinite_loop: 0,
      budget_exhaustion: 0,
      command_flakiness: 0,
      file_integrity: 0,
      tool_format_error: 0,
    };

    const denominator = Math.max(1, totalEvaluated);
    const criticalWeaknesses: WeaknessCategory[] = [];

    for (const key of Object.keys(categoryOccurrences) as WeaknessCategory[]) {
      const occurrences = categoryOccurrences[key];
      const score = Math.min(1.0, parseFloat((occurrences / denominator).toFixed(3)));
      categoryScores[key] = score;

      // Classify as critical if failure rate in this category is >= 20% or occurrences > 0 when evaluated count <= 3
      if (score >= 0.2 || (totalEvaluated <= 3 && occurrences > 0)) {
        criticalWeaknesses.push(key);
      }
    }

    // Determine recommended curriculum progression
    const failureRate = totalEvaluated > 0 ? failureCount / totalEvaluated : 0;
    const recommendedCurriculumStages: CurriculumDifficultyLevel[] = [];

    if (failureRate >= 0.5) {
      recommendedCurriculumStages.push('novice', 'intermediate');
    } else if (failureRate >= 0.2) {
      recommendedCurriculumStages.push('intermediate', 'advanced');
    } else {
      recommendedCurriculumStages.push('advanced', 'adversarial');
    }

    const profile: WeaknessProfile = {
      totalEvaluated,
      failureCount,
      categoryScores,
      categoryOccurrences,
      criticalWeaknesses,
      recommendedCurriculumStages,
    };

    return WeaknessProfileSchema.parse(profile);
  }
}

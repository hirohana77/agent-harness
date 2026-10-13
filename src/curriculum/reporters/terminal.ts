import chalk from 'chalk';
import { CurriculumResult } from '../types.js';

export class TerminalCurriculumReporter {
  public static render(result: CurriculumResult): string {
    const lines: string[] = [];
    const {
      curriculumId,
      curriculumName,
      passed,
      completedStages,
      totalStages,
      initialCompetency,
      finalCompetency,
      competencyDelta,
      stages,
      remediationMetrics,
      totalDurationMs,
      totalTokens,
      totalCostUsd,
    } = result;

    lines.push('');
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));
    lines.push(chalk.bold(`  AUTO-CURRICULUM CLOSED-LOOP REPORT: ${chalk.cyan(curriculumName || curriculumId)}`));
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));

    const statusBadge = passed
      ? chalk.green.bold('✔ CURRICULUM GRADUATED')
      : chalk.red.bold('✘ GATING BLOCKED / INCOMPLETE');

    const deltaSign = competencyDelta >= 0 ? '+' : '';
    const deltaColor = competencyDelta >= 0 ? chalk.green.bold : chalk.red.bold;

    lines.push(`Overall Status:       ${statusBadge}`);
    lines.push(
      `Stages Completed:     ${chalk.bold(`${completedStages} / ${totalStages}`)} (${Math.round((completedStages / totalStages) * 100)}%)`
    );
    lines.push(
      `Competency Rating:    ${chalk.yellow.bold(initialCompetency)} ➜ ${chalk.yellow.bold(finalCompetency)} (${deltaColor(`${deltaSign}${competencyDelta}`)})`
    );
    lines.push(
      `Total Consumption:    ${chalk.cyan(totalTokens.toLocaleString())} tokens | ${chalk.green(`$${totalCostUsd.toFixed(4)}`)} | ${chalk.gray(`${(totalDurationMs / 1000).toFixed(2)}s`)}`
    );
    lines.push('');

    // 1. Stage Progression Ladder
    lines.push(chalk.bold.underline('Curriculum Progression Ladder:'));
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const stageIcon = s.passed ? chalk.green('✔') : chalk.red('✘');
      const diffTag = chalk.magenta(`[${s.difficulty.toUpperCase()}]`);
      const guidanceTag = s.guidanceInjected ? chalk.cyan('(Guided)') : chalk.gray('(Baseline)');
      const passRatePct = Math.round(s.passRate * 100);

      lines.push(
        `  ${stageIcon} Stage ${i + 1}: ${chalk.bold(s.stageName)} ${diffTag} ${guidanceTag}`
      );
      lines.push(
        `     Pass Rate: ${passRatePct >= 75 ? chalk.green(`${passRatePct}%`) : chalk.red(`${passRatePct}%`)} (${s.passedScenarios}/${s.totalScenarios}) | Tokens: ${s.tokensUsed} | Duration: ${(s.durationMs / 1000).toFixed(2)}s`
      );

      for (const sc of s.scenarioResults) {
        const scIcon = sc.passed ? chalk.green('  •') : chalk.red('  ✖');
        const scStatus = sc.passed ? chalk.green('PASS') : chalk.red(`FAIL: ${sc.error || 'Unknown error'}`);
        lines.push(`       ${scIcon} ${sc.scenarioName || sc.scenarioId}: ${scStatus}`);
      }
    }
    lines.push('');

    // 2. Remediation & Uplift Metrics
    lines.push(chalk.bold.underline('Weakness Remediation & Guidance Uplift:'));
    const basePct = Math.round(remediationMetrics.baselinePassRate * 100);
    const guidedPct = Math.round(remediationMetrics.guidedPassRate * 100);
    const upliftSign = remediationMetrics.guidanceUpliftPercent >= 0 ? '+' : '';
    const upliftColor =
      remediationMetrics.guidanceUpliftPercent >= 0 ? chalk.green.bold : chalk.red.bold;

    lines.push(
      `  Baseline Pass Rate: ${chalk.gray(`${basePct}%`)} ➜ Guided Pass Rate: ${chalk.cyan.bold(`${guidedPct}%`)} (Uplift: ${upliftColor(`${upliftSign}${remediationMetrics.guidanceUpliftPercent}%`)})`
    );

    const remEntries = Object.entries(remediationMetrics.weaknessRemediations);
    if (remEntries.length > 0) {
      lines.push('  Target Weakness Remediations:');
      for (const [weakness, data] of remEntries) {
        const remBadge = data.remediated ? chalk.green('✔ REMEDIATED') : chalk.yellow('⚠ UNRESOLVED');
        const beforePct = Math.round(data.beforeFailureRate * 100);
        const afterPct = Math.round(data.afterFailureRate * 100);
        lines.push(
          `    - ${chalk.bold(weakness)}: ${remBadge} (Failure: ${beforePct}% ➜ ${afterPct}%)`
        );
      }
    }
    lines.push('');

    return lines.join('\n');
  }
}

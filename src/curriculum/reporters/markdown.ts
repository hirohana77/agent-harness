import { CurriculumResult } from '../types.js';

export class MarkdownCurriculumReporter {
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

    lines.push(`# Auto-Curriculum Closed-Loop Report: ${curriculumName || curriculumId}`);
    lines.push('');
    lines.push(`- **Status**: ${passed ? '✅ GRADUATED' : '❌ BLOCKED / INCOMPLETE'}`);
    lines.push(`- **Stages Completed**: ${completedStages} / ${totalStages} (${Math.round((completedStages / totalStages) * 100)}%)`);
    lines.push(`- **Competency Rating**: ${initialCompetency} ➜ **${finalCompetency}** (${competencyDelta >= 0 ? '+' : ''}${competencyDelta})`);
    lines.push(`- **Total Resource Usage**: ${totalTokens.toLocaleString()} tokens | $${totalCostUsd.toFixed(4)} | ${(totalDurationMs / 1000).toFixed(2)}s`);
    lines.push('');

    // Stage Ladder Table
    lines.push('## Curriculum Stages Progression');
    lines.push('');
    lines.push('| Stage | Difficulty | Guidance | Pass Rate | Scenarios (Passed/Total) | Tokens | Duration | Status |');
    lines.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |');
    for (const s of stages) {
      const statusIcon = s.passed ? '✅ PASS' : '❌ FAIL';
      const guidanceLabel = s.guidanceInjected ? 'Yes (Guided)' : 'No (Baseline)';
      const passRatePct = `${Math.round(s.passRate * 100)}%`;
      lines.push(
        `| **${s.stageName}** | \`${s.difficulty}\` | ${guidanceLabel} | ${passRatePct} | ${s.passedScenarios}/${s.totalScenarios} | ${s.tokensUsed.toLocaleString()} | ${(s.durationMs / 1000).toFixed(2)}s | ${statusIcon} |`
      );
    }
    lines.push('');

    // Scenario Details
    lines.push('### Scenario Breakdown');
    lines.push('');
    for (const s of stages) {
      lines.push(`#### ${s.stageName} (\`${s.difficulty}\`)`);
      for (const sc of s.scenarioResults) {
        const scIcon = sc.passed ? '✔' : '✖';
        const scError = sc.error ? ` - *${sc.error}*` : '';
        lines.push(`- ${scIcon} **${sc.scenarioName || sc.scenarioId}**: ${sc.passed ? 'Passed' : 'Failed'}${scError}`);
      }
      lines.push('');
    }

    // Remediation Metrics
    lines.push('## Weakness Remediation & Guidance Uplift');
    lines.push('');
    const basePct = `${Math.round(remediationMetrics.baselinePassRate * 100)}%`;
    const guidedPct = `${Math.round(remediationMetrics.guidedPassRate * 100)}%`;
    const upliftSign = remediationMetrics.guidanceUpliftPercent >= 0 ? '+' : '';
    lines.push(`- **Baseline Pass Rate**: ${basePct}`);
    lines.push(`- **Guided Pass Rate**: ${guidedPct}`);
    lines.push(`- **Guidance Uplift**: **${upliftSign}${remediationMetrics.guidanceUpliftPercent}%**`);
    lines.push('');

    const remEntries = Object.entries(remediationMetrics.weaknessRemediations);
    if (remEntries.length > 0) {
      lines.push('| Weakness Category | Before Failure Rate | After Failure Rate | Status |');
      lines.push('| :--- | :---: | :---: | :---: |');
      for (const [weakness, data] of remEntries) {
        const statusLabel = data.remediated ? '✅ Remediated' : '⚠ Unresolved';
        lines.push(
          `| \`${weakness}\` | ${Math.round(data.beforeFailureRate * 100)}% | ${Math.round(data.afterFailureRate * 100)}% | ${statusLabel} |`
        );
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

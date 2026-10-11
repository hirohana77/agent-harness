import { ClusterConsensusResult } from '../types.js';

export class MarkdownConsensusReporter {
  public static render(result: ClusterConsensusResult): string {
    const { metrics, bottlenecks, deadEnds, canonicalTrajectory, trajectories, scenarioId } = result;
    const lines: string[] = [];

    lines.push(`# Cluster Trajectory Consensus Report: \`${scenarioId}\``);
    lines.push('');
    lines.push('## Executive Summary');
    lines.push('');
    lines.push('| Metric | Value | Status |');
    lines.push('| :--- | :--- | :--- |');
    lines.push(
      `| **Consensus Score** | **${metrics.overallAgreementScore.toFixed(1)} / 100** | ${metrics.overallAgreementScore >= 80 ? '🟢 High Agreement' : metrics.overallAgreementScore >= 50 ? '🟡 Moderate Drift' : '🔴 Low Consensus'} |`
    );
    lines.push(`| **Evaluated Runs** | ${metrics.totalTrajectories} | ${metrics.successfulTrajectories} passed / ${metrics.failedTrajectories} failed (${(metrics.successRate * 100).toFixed(0)}% pass rate) |`);
    lines.push(`| **Path Diversity Entropy** | ${metrics.pathDiversityEntropy.toFixed(2)} bits | ${metrics.pathDiversityEntropy <= 0.5 ? 'Deterministic' : 'Exploratory'} |`);
    lines.push(`| **Golden Path Steps** | ${canonicalTrajectory.totalSteps} steps | ${canonicalTrajectory.confidenceScore.toFixed(1)}% confidence (${canonicalTrajectory.prunedOutlierStepsCount} outliers pruned) |`);
    lines.push('');

    lines.push('## Rollouts Overview');
    lines.push('');
    lines.push('| Run ID | Status | Turns | Tokens | Duration |');
    lines.push('| :--- | :---: | :---: | :---: | :---: |');
    for (const t of trajectories) {
      const badge = t.status === 'completed' ? '`PASS`' : '`FAIL`';
      lines.push(`| \`${t.id}\` | ${badge} | ${t.turnsCount} | ${t.tokens} | ${t.durationMs}ms |`);
    }
    lines.push('');

    lines.push('## Consensus Step Distribution');
    lines.push('');
    lines.push(`- **Invariant Steps (100%)**: ${metrics.invariantStepsCount}`);
    lines.push(`- **Majority Steps (>50%)**: ${metrics.majorityStepsCount}`);
    lines.push(`- **Minority Steps (<=50%)**: ${metrics.minorityStepsCount}`);
    lines.push(`- **Outlier Steps (1 run)**: ${metrics.outlierStepsCount}`);
    lines.push('');

    if (bottlenecks.length > 0) {
      lines.push('## Invariant Bottlenecks (Critical Path Checkpoints)');
      lines.push('');
      lines.push('| Col | Tool / Step | Frequency | Success Correlation | Description |');
      lines.push('| :---: | :--- | :---: | :---: | :--- |');
      for (const b of bottlenecks) {
        lines.push(
          `| #${b.columnIndex} | \`${b.step.toolName || b.step.stepType}\` | ${(b.frequency * 100).toFixed(0)}% | \`${b.successCorrelation >= 0 ? '+' : ''}${b.successCorrelation.toFixed(2)}\` | ${b.description} |`
        );
      }
      lines.push('');
    }

    if (deadEnds.length > 0) {
      lines.push('## Dead-End Failure Traps');
      lines.push('');
      lines.push('| Col | Tool / Step | Failure Rate | Trapped Runs | Error Details |');
      lines.push('| :---: | :--- | :---: | :---: | :--- |');
      for (const d of deadEnds) {
        lines.push(
          `| #${d.columnIndex} | \`${d.step.toolName || d.step.stepType}\` | ${(d.failureRate * 100).toFixed(0)}% | ${d.affectedTrajectories.map((id) => `\`${id}\``).join(', ')} | ${d.errorDetails.join('; ') || 'N/A'} |`
        );
      }
      lines.push('');
    }

    lines.push('## Multi-Sequence Alignment Timeline Matrix');
    lines.push('');
    lines.push('| Col | Step Type | Agreement | Level | Flags |');
    lines.push('| :---: | :--- | :---: | :---: | :--- |');
    for (const col of result.alignmentColumns) {
      const tool = col.dominantToolName || col.consensusStep?.stepType || 'gap';
      const flags: string[] = [];
      if (col.isBottleneck) flags.push('★ Checkpoint');
      if (col.isTrap) flags.push('⚠ Trap');
      lines.push(
        `| #${col.columnIndex} | \`${tool}\` | ${(col.agreementRate * 100).toFixed(0)}% | \`${col.level}\` | ${flags.join(' ') || '-'} |`
      );
    }
    lines.push('');

    return lines.join('\n');
  }
}

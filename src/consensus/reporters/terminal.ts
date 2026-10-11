import chalk from 'chalk';
import { ClusterConsensusResult } from '../types.js';

export class TerminalConsensusReporter {
  public static render(result: ClusterConsensusResult): string {
    const lines: string[] = [];
    const { metrics, bottlenecks, deadEnds, canonicalTrajectory, trajectories, scenarioId } = result;

    lines.push('');
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));
    lines.push(chalk.bold(`  CLUSTER TRAJECTORY CONSENSUS REPORT: ${chalk.cyan(scenarioId)}`));
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));

    // 1. Overall Cluster Health & Agreement Score
    const agreementColor =
      metrics.overallAgreementScore >= 80
        ? chalk.green
        : metrics.overallAgreementScore >= 50
        ? chalk.yellow
        : chalk.red;

    lines.push(
      `Consensus Score:      ${agreementColor.bold(metrics.overallAgreementScore.toFixed(1) + ' / 100')}`
    );
    lines.push(
      `Rollouts Evaluated:   ${chalk.bold(metrics.totalTrajectories)} runs (${chalk.green(metrics.successfulTrajectories + ' success')}, ${chalk.red(metrics.failedTrajectories + ' failed')}, ${(metrics.successRate * 100).toFixed(0)}% pass rate)`
    );
    lines.push(
      `Path Diversity (H):   ${chalk.cyan(metrics.pathDiversityEntropy.toFixed(2))} bits (lower = more deterministic)`
    );
    lines.push(
      `Golden Path Length:   ${chalk.bold(canonicalTrajectory.totalSteps)} steps (confidence: ${chalk.green(canonicalTrajectory.confidenceScore.toFixed(1) + '%')}, pruned: ${chalk.yellow(canonicalTrajectory.prunedOutlierStepsCount)} outliers)`
    );
    lines.push('');

    // 2. Trajectories Summary
    lines.push(chalk.bold.underline('Evaluated Trajectory Rollouts:'));
    for (const t of trajectories) {
      const statusBadge =
        t.status === 'completed'
          ? chalk.bgGreen.black(' PASS ')
          : chalk.bgRed.black(' FAIL ');
      lines.push(
        `  • ${statusBadge} ${chalk.bold(t.id)}: ${t.turnsCount} turns, ${t.tokens} tokens, ${t.durationMs}ms`
      );
    }
    lines.push('');

    // 3. Step Breakdown by Consensus Level
    lines.push(chalk.bold.underline('Step Alignment Consensus Distribution:'));
    lines.push(
      `  • Invariant (100% agreement):  ${chalk.green.bold(metrics.invariantStepsCount)} steps`
    );
    lines.push(
      `  • Majority  (>50% agreement):  ${chalk.blue.bold(metrics.majorityStepsCount)} steps`
    );
    lines.push(
      `  • Minority  (<=50% agreement): ${chalk.yellow.bold(metrics.minorityStepsCount)} steps`
    );
    lines.push(
      `  • Outlier   (single-run only): ${chalk.gray(metrics.outlierStepsCount)} steps`
    );
    lines.push('');

    // 4. Bottleneck Checkpoints
    if (bottlenecks.length > 0) {
      lines.push(chalk.bold.underline('Identified Invariant Bottlenecks (Critical Nodes):'));
      for (const b of bottlenecks) {
        const toolStr = chalk.cyan.bold(b.step.toolName || b.step.stepType);
        lines.push(
          `  ★ Col #${b.columnIndex}: ${toolStr} [${(b.frequency * 100).toFixed(0)}% freq, r=${b.successCorrelation.toFixed(2)}]`
        );
        lines.push(`    ${chalk.gray(b.description)}`);
      }
      lines.push('');
    }

    // 5. Dead-End Failure Traps
    if (deadEnds.length > 0) {
      lines.push(chalk.bold.underline('Dead-End Failure Traps (Hazard Nodes):'));
      for (const d of deadEnds) {
        const toolStr = chalk.red.bold(d.step.toolName || d.step.stepType);
        lines.push(
          `  ⚠ Col #${d.columnIndex}: ${toolStr} [${(d.failureRate * 100).toFixed(0)}% failure rate, ${d.affectedTrajectories.length} runs trapped]`
        );
        if (d.errorDetails.length > 0) {
          lines.push(`    ${chalk.gray('Errors: ' + d.errorDetails.join('; '))}`);
        }
      }
      lines.push('');
    }

    // 6. Aligned Consensus Matrix Visualization
    lines.push(chalk.bold.underline('Multi-Sequence Alignment Timeline Matrix:'));
    for (const col of result.alignmentColumns) {
      let badge = chalk.gray('[OUTLIER]');
      if (col.level === 'invariant') badge = chalk.green('[INVAR]  ');
      else if (col.level === 'majority') badge = chalk.blue('[MAJOR]  ');
      else if (col.level === 'minority') badge = chalk.yellow('[MINOR]  ');

      const toolName = col.dominantToolName || col.consensusStep?.stepType || 'gap';
      const flag = col.isBottleneck ? chalk.magenta(' ★CHECKPOINT') : col.isTrap ? chalk.red(' ⚠TRAP') : '';
      const slotsViz = col.slots
        .map((s) => (s.gap ? chalk.gray('·') : chalk.white('■')))
        .join(' ');

      lines.push(
        `  ${badge} Col #${String(col.columnIndex).padStart(2, '0')}: [${slotsViz}] ${chalk.bold(toolName.padEnd(16, ' '))} (${(col.agreementRate * 100).toFixed(0)}%)${flag}`
      );
    }
    lines.push('');

    return lines.join('\n');
  }
}

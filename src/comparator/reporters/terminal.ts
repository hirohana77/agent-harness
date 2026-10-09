import chalk from 'chalk';
import { TrajectoryDiff } from '../types.js';

export class TerminalDiffReporter {
  public static render(diff: TrajectoryDiff): string {
    const lines: string[] = [];

    // 1. Header & Severity Badge
    lines.push('');
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));
    lines.push(chalk.bold(`  TRAJECTORY DIFFERENTIAL ANALYSIS: ${chalk.cyan(diff.scenarioId)}`));
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));

    const { regression } = diff;
    let badge = '';
    switch (regression.severity) {
      case 'identical':
        badge = chalk.bgGreen.black.bold(' IDENTICAL ') + ' ' + chalk.green('Candidate execution matches baseline identically.');
        break;
      case 'equivalent':
        badge = chalk.bgBlue.black.bold(' EQUIVALENT ') + ' ' + chalk.blue('Candidate reached equivalent outcome with minor step differences.');
        break;
      case 'minor_drift':
        badge = chalk.bgYellow.black.bold(' MINOR DRIFT ') + ' ' + chalk.yellow('Execution drifted from baseline but completed without severe regression.');
        break;
      case 'regression':
        badge = chalk.bgRed.black.bold(' REGRESSION ') + ' ' + chalk.red('Candidate exhibited performance, functional, or stability regression.');
        break;
      case 'critical_failure':
        badge = chalk.bgRedBright.black.bold(' CRITICAL FAILURE ') + ' ' + chalk.redBright('Candidate suffered severe errors, crashes, or premature termination.');
        break;
    }

    lines.push(`Verdict: ${badge}`);
    lines.push(`Similarity Score: ${chalk.bold((regression.score * 100).toFixed(1) + '%')}`);
    lines.push('');

    // 2. Metrics Table
    lines.push(chalk.bold.underline('Metric Comparison:'));
    const { summary } = diff;
    const formatDelta = (val: number, unit = '') => {
      if (val === 0) return chalk.gray('0' + unit);
      if (val > 0) return chalk.yellow(`+${val}${unit}`);
      return chalk.green(`${val}${unit}`);
    };

    lines.push(`  • Status:     Baseline: ${chalk.cyan(summary.status.baseline)}  →  Candidate: ${summary.status.regressed ? chalk.red(summary.status.candidate) : chalk.cyan(summary.status.candidate)}`);
    lines.push(`  • Turns:      Baseline: ${summary.turns.baseline}  |  Candidate: ${summary.turns.candidate}  (${formatDelta(summary.turns.delta)})`);
    lines.push(`  • Tool Calls: Baseline: ${summary.toolCalls.baseline}  |  Candidate: ${summary.toolCalls.candidate}  (${formatDelta(summary.toolCalls.delta)})`);
    lines.push(`  • Tokens:     Baseline: ${summary.tokens.baselineTotal}  |  Candidate: ${summary.tokens.candidateTotal}  (${formatDelta(summary.tokens.totalDelta)})`);
    lines.push(`    - Prompt:   ${summary.tokens.baselinePrompt} → ${summary.tokens.candidatePrompt} (${formatDelta(summary.tokens.promptDelta)})`);
    lines.push(`    - Compl.:   ${summary.tokens.baselineCompletion} → ${summary.tokens.candidateCompletion} (${formatDelta(summary.tokens.completionDelta)})`);
    lines.push(`  • Duration:   Baseline: ${summary.durationMs.baseline}ms  |  Candidate: ${summary.durationMs.candidate}ms  (${formatDelta(summary.durationMs.delta, 'ms')})`);
    if (summary.costUsd.baseline > 0 || summary.costUsd.candidate > 0) {
      lines.push(`  • Cost USD:   Baseline: $${summary.costUsd.baseline.toFixed(4)}  |  Candidate: $${summary.costUsd.candidate.toFixed(4)}  (${formatDelta(Number(summary.costUsd.delta.toFixed(4)), '$')})`);
    }
    lines.push('');

    // 3. First Divergence Callout
    if (diff.firstDivergence) {
      lines.push(chalk.bold.yellow('⚠ First Divergence Point:'));
      lines.push(`  • Turn ${diff.firstDivergence.turnNumber}, Step ${diff.firstDivergence.stepIndex} [${chalk.magenta(diff.firstDivergence.type)}]`);
      lines.push(`  • ${chalk.white(diff.firstDivergence.description)}`);
      lines.push('');
    }

    // 4. Anomalies
    if (regression.anomalies.length > 0) {
      lines.push(chalk.bold.red('🚨 Detected Anomalies:'));
      for (const a of regression.anomalies) {
        lines.push(`  • [${chalk.red(a.type)}] ${a.message}`);
      }
      lines.push('');
    }

    // 5. Tool Breakdown
    const toolKeys = Object.keys(diff.toolDistribution);
    if (toolKeys.length > 0) {
      lines.push(chalk.bold.underline('Tool Invocation Breakdown:'));
      for (const tool of toolKeys) {
        const dist = diff.toolDistribution[tool];
        lines.push(`  • ${chalk.cyan(tool.padEnd(20))} Base: ${dist.baseline.toString().padStart(2)}  |  Cand: ${dist.candidate.toString().padStart(2)}  (${formatDelta(dist.delta)})`);
      }
      lines.push('');
    }

    // 6. Aligned Execution Steps
    lines.push(chalk.bold.underline('Aligned Step Trajectory:'));
    for (const step of diff.alignment) {
      let icon = '';
      let tag = '';
      let details = '';

      switch (step.alignmentType) {
        case 'match':
          icon = chalk.green('✔');
          tag = chalk.green('[MATCH]');
          details = `${step.baselineStep?.toolName || 'turn_end'}`;
          break;
        case 'modified':
          icon = chalk.yellow('~');
          tag = chalk.yellow('[MODIFIED]');
          details = `${step.baselineStep?.toolName || 'step'} → ${step.candidateStep?.toolName || 'step'} (${step.divergenceDetails || 'args/result differed'})`;
          break;
        case 'added':
          icon = chalk.cyan('+');
          tag = chalk.cyan('[ADDED]');
          details = `${step.candidateStep?.toolName || 'turn_end'} (in candidate)`;
          break;
        case 'removed':
          icon = chalk.red('-');
          tag = chalk.red('[REMOVED]');
          details = `${step.baselineStep?.toolName || 'turn_end'} (in baseline)`;
          break;
      }

      lines.push(`  ${icon} Step ${step.stepIndex.toString().padStart(2)}: ${tag} ${details}`);
    }
    lines.push('');

    return lines.join('\n');
  }
}

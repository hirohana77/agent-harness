import chalk from 'chalk';
import { DistilledPolicy } from '../types.js';

export class TerminalDistillationReporter {
  public static render(policy: DistilledPolicy): string {
    const lines: string[] = [];
    const { metadata, milestones, antiPatterns, fewShotExemplar, steeringRules } = policy;

    lines.push('');
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));
    lines.push(chalk.bold(`  DISTILLED POLICY & GUIDANCE REPORT: ${chalk.cyan(metadata.scenarioId)}`));
    lines.push(chalk.bold('════════════════════════════════════════════════════════════════════'));

    const confColor =
      metadata.confidenceScore >= 80
        ? chalk.green
        : metadata.confidenceScore >= 60
        ? chalk.yellow
        : chalk.red;

    lines.push(
      `Confidence Score:     ${confColor.bold(metadata.confidenceScore.toFixed(1) + ' / 100')} (Source: ${chalk.bold(metadata.source)})`
    );
    lines.push(
      `Synthesized From:     ${chalk.bold(metadata.sourceTrajectoriesCount)} trajectory rollouts`
    );
    lines.push(
      `Milestones Extracted: ${chalk.green.bold(milestones.length)} proven invariant checkpoints`
    );
    lines.push(
      `Pitfalls Isolated:    ${chalk.red.bold(antiPatterns.length)} negative hazard patterns`
    );
    lines.push(
      `Estimated Tokens:     ${chalk.cyan(metadata.estimatedTokens)} tokens (${fewShotExemplar?.isPruned ? chalk.yellow('budget-pruned') : chalk.gray('unpruned')})`
    );
    lines.push('');

    // 1. Invariant Milestones
    lines.push(chalk.bold.underline('Proven Milestone Roadmap:'));
    if (milestones.length === 0) {
      lines.push(chalk.gray('  (No milestones identified)'));
    } else {
      milestones.forEach((m) => {
        const badge =
          m.importance === 'critical'
            ? chalk.bgRed.black(' CRIT ')
            : chalk.bgBlue.black(' RECM ');
        const toolStr = chalk.cyan.bold(m.targetTool);
        lines.push(
          `  ${badge} #${m.order}: ${chalk.bold(m.name)} [Tool: ${toolStr}]`
        );
        lines.push(`    ${chalk.gray(m.description)}`);
        if (m.argumentPattern) {
          lines.push(`    ${chalk.magenta('Pattern')}: ${chalk.yellow(m.argumentPattern)}`);
        }
      });
    }
    lines.push('');

    // 2. Negative Guidance / Pitfalls
    if (antiPatterns.length > 0) {
      lines.push(chalk.bold.underline('Prohibited Pitfalls & Hazard Traps:'));
      antiPatterns.forEach((ap, idx) => {
        const badge =
          ap.severity === 'critical'
            ? chalk.bgRed.black(' BLOCK ')
            : chalk.bgYellow.black(' WARN ');
        const toolStr = chalk.red.bold(ap.triggerTool);
        lines.push(
          `  ${badge} #${idx + 1}: ${chalk.bold(ap.name)} [Tool: ${toolStr}]`
        );
        lines.push(`    ${chalk.gray('Reason: ' + ap.reason)}`);
        lines.push(`    ${chalk.green('Remedy: ' + ap.remedyHint)}`);
        if (ap.errorKeywords.length > 0) {
          lines.push(`    ${chalk.gray('Keywords: ' + ap.errorKeywords.join(', '))}`);
        }
      });
      lines.push('');
    }

    // 3. Steering Rules Blueprint
    if (steeringRules.length > 0) {
      lines.push(chalk.bold.underline('Active Steering Controller Interventions:'));
      steeringRules.forEach((sr, idx) => {
        lines.push(
          `  ⚡ #${idx + 1}: ${chalk.bold(sr.name)} -> Action: ${chalk.cyan(sr.intervention.type)}`
        );
        lines.push(`    ${chalk.gray(sr.description)}`);
      });
      lines.push('');
    }

    // 4. Few-shot Exemplar status
    if (fewShotExemplar) {
      lines.push(chalk.bold.underline('Few-Shot Exemplar Trace:'));
      lines.push(
        `  Turns: ${chalk.bold(fewShotExemplar.turns.length)} | Tokens: ~${chalk.cyan(fewShotExemplar.tokenEstimate)} | Pruned: ${fewShotExemplar.isPruned ? chalk.yellow('YES') : chalk.gray('NO')}`
      );
      lines.push('');
    }

    return lines.join('\n');
  }
}

import chalk from "chalk";
import { ResilienceScorecard } from "../types.js";

export class TerminalResilienceReporter {
  public static render(scorecard: ResilienceScorecard): string {
    const lines: string[] = [];
    const { metrics, events, recommendations } = scorecard;

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold(`  AGENT CHAOS RESILIENCE SCORECARD: ${chalk.cyan(scorecard.profileId)}`));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════"));

    // 1. Rating Badge
    let ratingBadge = "";
    switch (metrics.rating) {
      case "S":
        ratingBadge = chalk.bgGreen.black.bold(" GRADE S ") + " " + chalk.green("Indestructible — Flawless recovery & zero poisoning.");
        break;
      case "A":
        ratingBadge = chalk.bgBlue.black.bold(" GRADE A ") + " " + chalk.blue("Resilient — Successfully handled faults with minimal delay.");
        break;
      case "B":
        ratingBadge = chalk.bgYellow.black.bold(" GRADE B ") + " " + chalk.yellow("Degraded — Recovered but suffered latency or slow adaptation.");
        break;
      case "C":
        ratingBadge = chalk.bgRed.black.bold(" GRADE C ") + " " + chalk.red("Vulnerable — Exhibited loops or partial fault failures.");
        break;
      case "F":
        ratingBadge = chalk.bgRedBright.black.bold(" GRADE F ") + " " + chalk.redBright("Fragile — Failed to recover, entered deadlocks or leaked canaries.");
        break;
    }

    lines.push(`Resilience Rating: ${ratingBadge}`);
    lines.push(`Resilience Score:  ${chalk.bold(metrics.resilienceScore.toFixed(1) + " / 100")}`);
    lines.push(`Timestamp:         ${chalk.gray(scorecard.timestamp)}`);
    if (scorecard.scenarioId) {
      lines.push(`Scenario:          ${chalk.cyan(scorecard.scenarioId)}`);
    }
    lines.push("");

    // 2. Metrics Breakdown Table
    lines.push(chalk.bold.underline("Resilience Metrics Breakdown:"));
    lines.push(`  • Total Tool Calls:        ${chalk.bold(metrics.totalToolCalls)}`);
    lines.push(`  • Injected Chaos Faults:   ${chalk.yellow(metrics.injectedFaults)} (${(metrics.faultInjectionRate * 100).toFixed(0)}% injection rate)`);
    lines.push(`  • Fault Recovery Rate:     ${metrics.recoveryRate >= 0.8 ? chalk.green((metrics.recoveryRate * 100).toFixed(0) + "%") : chalk.red((metrics.recoveryRate * 100).toFixed(0) + "%")} (${metrics.recoveredFaults}/${metrics.injectedFaults} recovered)`);
    lines.push(`  • Mean Turns to Recovery:  ${metrics.meanTurnsToRecovery <= 2 ? chalk.green(metrics.meanTurnsToRecovery + " turns") : chalk.yellow(metrics.meanTurnsToRecovery + " turns")}`);
    lines.push(`  • Retry Storms / Loops:    ${metrics.loopPenaltyCount === 0 ? chalk.green("0 detected") : chalk.red(`${metrics.loopPenaltyCount} detected`)}`);
    lines.push(`  • Poison Defense Rate:     ${metrics.poisonDefenseRate === 1.0 ? chalk.green("100% (Zero leak)") : chalk.red((metrics.poisonDefenseRate * 100).toFixed(0) + "% (" + metrics.adversarialPoisonCount + " leaked)")}`);
    lines.push("");

    // 3. Fault Injection Events Table
    if (events.length > 0) {
      lines.push(chalk.bold.underline("Injected Chaos Events:"));
      events.forEach((evt, idx) => {
        const typeBadge = chalk.magenta(`[${evt.faultType.toUpperCase()}]`);
        const argsStr = Object.keys(evt.args || {}).length > 0 ? chalk.gray(` [${JSON.stringify(evt.args)}]`) : "";
        lines.push(`  ${idx + 1}. Call #${evt.callIndex} ${typeBadge} on ${chalk.bold(evt.toolName)}${argsStr} (${evt.ruleId})`);
        if (evt.details?.outputOverride) {
          const override = evt.details.outputOverride as any;
          lines.push(`     ${chalk.gray("⤷ Result:")} success=${override.success}, exitCode=${override.exitCode}, error="${override.error || ""}"`);
        }
        if (evt.details?.latencyMs) {
          lines.push(`     ${chalk.gray("⤷ Latency:")} +${evt.details.latencyMs}ms`);
        }
      });
      lines.push("");
    }

    // 4. Recommendations
    lines.push(chalk.bold.underline("Architectural Recommendations:"));
    recommendations.forEach((rec) => {
      lines.push(`  ⚠ ${chalk.cyan(rec)}`);
    });
    lines.push("");

    return lines.join("\n");
  }
}

import chalk from "chalk";
import { HarnessReport } from "../core/types.js";

export class TerminalReporter {
  public static format(report: HarnessReport): string {
    const lines: string[] = [];
    const statusTag = report.passed
      ? chalk.bold.bgGreen.black(" PASS ")
      : chalk.bold.bgRed.white(" FAIL ");

    lines.push("");
    lines.push(`  ${statusTag}  ${chalk.bold(report.scenarioName || report.scenarioId)}`);
    lines.push(chalk.gray(`  Scenario ID: ${report.scenarioId} | Timestamp: ${report.timestamp}`));
    lines.push("");

    // Metrics summary
    const durationSec = (report.metrics.durationMs / 1000).toFixed(2);
    lines.push(chalk.cyan("  Metrics & Budgets:"));
    lines.push(`    • Duration:      ${chalk.yellow(`${durationSec}s`)}`);
    lines.push(`    • Total Turns:   ${chalk.yellow(report.metrics.totalTurns)}`);
    lines.push(`    • Total Tokens:  ${chalk.yellow(report.metrics.totalTokens)}`);
    if (report.metrics.costUsd > 0) {
      lines.push(`    • Cost (USD):    ${chalk.yellow(`$${report.metrics.costUsd.toFixed(4)}`)}`);
    }
    lines.push(
      `    • Assertions:    ${chalk.green(`${report.metrics.passedAssertions} passed`)}, ${
        report.metrics.failedAssertions > 0
          ? chalk.red(`${report.metrics.failedAssertions} failed`)
          : "0 failed"
      }, ${report.metrics.totalAssertions} total`
    );
    lines.push("");

    // Assertion items
    lines.push(chalk.cyan("  Assertion Results:"));
    for (const item of report.assertionResults) {
      const icon = item.passed ? chalk.green("✔") : chalk.red("✘");
      const typeTag = chalk.gray(`[${item.type}]`);
      const target = chalk.white(item.target);
      lines.push(`    ${icon} ${typeTag} ${target}`);
      if (!item.passed || item.message) {
        const color = item.passed ? chalk.gray : chalk.red;
        lines.push(`        ${color(item.message)}`);
      }
    }

    lines.push("");
    return lines.join("\n");
  }

  public static print(report: HarnessReport): void {
    console.log(this.format(report));
  }
}

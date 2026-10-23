import chalk from "chalk";
import { TimeTravelReport } from "../types.js";

export class TerminalTimeTravelReporter {
  public static render(report: TimeTravelReport): string {
    const lines: string[] = [];

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold(`  ⏱  AGENT TIME-TRAVEL DEBUGGER & COUNTERFACTUAL REPORT: ${chalk.cyan(report.scenarioId)}`));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(`Timestamp:            ${chalk.gray(report.timestamp)}`);
    lines.push(`Total Turns:          ${chalk.bold(report.totalTurns)}`);
    lines.push(`Snapshots Stored:     ${chalk.bold(report.snapshotsCount)}`);
    lines.push("");

    // Bisect section
    if (report.bisectResult) {
      const b = report.bisectResult;
      lines.push(chalk.bold.yellow("── Bisect Root-Cause Attribution ───────────────────────────────────────"));
      if (b.firstFaultyTurn !== null) {
        lines.push(`First Faulty Turn:    ${chalk.red.bold(`Turn ${b.firstFaultyTurn}`)}`);
        if (b.faultyToolCall) {
          lines.push(`Faulty Tool Call:     ${chalk.magenta(b.faultyToolCall.toolName)} (exit code: ${b.faultyToolCall.result?.exitCode ?? "N/A"})`);
        }
        lines.push(`Confidence:           ${chalk.green.bold(`${Math.round(b.confidence * 100)}%`)}`);
        lines.push(`Steps Evaluated:      ${chalk.bold(b.stepsEvaluated)} (${b.durationMs}ms)`);
        lines.push(`Root Cause Summary:   ${chalk.yellow(b.rootCauseDescription)}`);
        lines.push("");
        lines.push(chalk.gray("  Binary Search Evaluation Log:"));
        for (const ev of b.evaluations) {
          const badge = ev.passed ? chalk.green("✔ PASS") : chalk.red("✘ FAIL");
          lines.push(`    Turn ${String(ev.turnNumber).padEnd(3)}: ${badge}  ${chalk.gray(ev.reason || "")}`);
        }
      } else {
        lines.push(chalk.green(`✔ ${b.rootCauseDescription}`));
      }
      lines.push("");
    }

    // Counterfactual branches
    if (report.counterfactualBranches.length > 0) {
      lines.push(chalk.bold.cyan("── Counterfactual Branch Simulations ───────────────────────────────────"));
      for (const branch of report.counterfactualBranches) {
        const delta = branch.outcomeDelta;
        const statusBadge =
          delta.statusChange === "rescued"
            ? chalk.green.bold("RESCUED ✔")
            : delta.statusChange === "worsened"
            ? chalk.red.bold("WORSENED ✘")
            : chalk.gray("NEUTRAL");

        lines.push(`Branch: ${chalk.bold(branch.branchName)} (ID: ${branch.branchId})`);
        lines.push(`  Fork Turn:          Turn ${branch.forkTurn}`);
        lines.push(`  Status Change:      ${statusBadge}`);
        lines.push(`  Turn Delta:         ${delta.originalTurns} turns baseline ➔ ${delta.branchTurns} turns branch (${delta.turnReduction >= 0 ? `-${delta.turnReduction}` : `+${Math.abs(delta.turnReduction)}`})`);
        lines.push(`  Token Delta:        ${delta.originalTokens} tokens ➔ ${delta.branchTokens} tokens`);
        lines.push(`  Mutations Applied:  ${branch.mutations.map((m) => m.type).join(", ")}`);
        lines.push("");
      }
    }

    // Timeline summary
    lines.push(chalk.bold("── Trajectory Timeline ─────────────────────────────────────────────────"));
    for (const t of report.timeline) {
      const statusIcon =
        t.status === "failure"
          ? chalk.red("✘")
          : t.status === "warning"
          ? chalk.yellow("⚠")
          : chalk.green("✔");

      const toolsStr = t.toolNames.join(", ") || "(no tools)";
      const exitStr = t.exitCodes.length > 0 ? `[code: ${t.exitCodes.join(",")}]` : "";
      const deltaStr = t.deltasCount > 0 ? `(${t.deltasCount} file deltas)` : "";

      lines.push(
        `  ${statusIcon} Turn ${String(t.turnNumber).padStart(2)}: ${chalk.bold(toolsStr.padEnd(20))} ${chalk.gray(exitStr.padEnd(12))} ${chalk.gray(deltaStr)}`
      );
    }
    lines.push("");

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push(chalk.bold("── Diagnostic Recommendations ──────────────────────────────────────────"));
      for (const rec of report.recommendations) {
        lines.push(`  ${chalk.cyan("•")} ${rec}`);
      }
      lines.push("");
    }

    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push("");

    return lines.join("\n");
  }
}

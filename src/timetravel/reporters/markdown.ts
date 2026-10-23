import { TimeTravelReport } from "../types.js";

export class MarkdownTimeTravelReporter {
  public static render(report: TimeTravelReport): string {
    const lines: string[] = [];

    lines.push(`# ⏱ Agent Time-Travel Debugger & Counterfactual Report`);
    lines.push("");
    lines.push(`**Scenario ID**: \`${report.scenarioId}\`  `);
    lines.push(`**Timestamp**: \`${report.timestamp}\`  `);
    lines.push(`**Total Turns**: \`${report.totalTurns}\`  `);
    lines.push(`**Snapshots Recorded**: \`${report.snapshotsCount}\`  `);
    lines.push("");

    if (report.bisectResult) {
      const b = report.bisectResult;
      lines.push(`## 🔍 Bisect Root-Cause Attribution`);
      lines.push("");
      lines.push(`- **First Faulty Turn**: ${b.firstFaultyTurn !== null ? `**Turn ${b.firstFaultyTurn}**` : "_None (All steps passed)_"}`);
      if (b.faultyToolCall) {
        lines.push(`- **Faulty Tool Call**: \`${b.faultyToolCall.toolName}\` (exit code: \`${b.faultyToolCall.result?.exitCode ?? "N/A"}\`)`);
      }
      lines.push(`- **Confidence**: **${Math.round(b.confidence * 100)}%**`);
      lines.push(`- **Evaluations / Duration**: ${b.stepsEvaluated} steps in ${b.durationMs}ms`);
      lines.push(`- **Root Cause Summary**: ${b.rootCauseDescription}`);
      lines.push("");

      if (b.evaluations.length > 0) {
        lines.push(`### Bisect Search Log`);
        lines.push("");
        lines.push(`| Turn | Status | Diagnostic Reason |`);
        lines.push(`| :--- | :--- | :--- |`);
        for (const ev of b.evaluations) {
          const statusBadge = ev.passed ? "✔ PASS" : "✘ FAIL";
          lines.push(`| Turn ${ev.turnNumber} | ${statusBadge} | ${ev.reason || "N/A"} |`);
        }
        lines.push("");
      }
    }

    if (report.counterfactualBranches.length > 0) {
      lines.push(`## 🔀 Counterfactual Branch Simulations`);
      lines.push("");
      lines.push(`| Branch Name | Fork Turn | Status Change | Turns (Base ➔ Branch) | Tokens (Base ➔ Branch) | Mutations |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- |`);
      for (const branch of report.counterfactualBranches) {
        const d = branch.outcomeDelta;
        const statusBadge =
          d.statusChange === "rescued"
            ? "**RESCUED ✔**"
            : d.statusChange === "worsened"
            ? "**WORSENED ✘**"
            : "NEUTRAL";
        const muts = branch.mutations.map((m) => `\`${m.type}\``).join(", ");
        lines.push(
          `| \`${branch.branchName}\` | Turn ${branch.forkTurn} | ${statusBadge} | ${d.originalTurns} ➔ ${d.branchTurns} | ${d.originalTokens} ➔ ${d.branchTokens} | ${muts} |`
        );
      }
      lines.push("");
    }

    lines.push(`## 📜 Trajectory Timeline`);
    lines.push("");
    lines.push(`| Turn | Tools | Exit Codes | File Deltas | Status |`);
    lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
    for (const t of report.timeline) {
      const statusBadge = t.status === "failure" ? "🔴 Failure" : t.status === "warning" ? "🟡 Modified" : "🟢 Succeeded";
      const tools = t.toolNames.map((n) => `\`${n}\``).join(", ") || "_none_";
      const codes = t.exitCodes.length > 0 ? t.exitCodes.join(", ") : "-";
      lines.push(`| Turn ${t.turnNumber} | ${tools} | ${codes} | ${t.deltasCount} | ${statusBadge} |`);
    }
    lines.push("");

    if (report.recommendations.length > 0) {
      lines.push(`## 💡 Diagnostic Recommendations`);
      lines.push("");
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}

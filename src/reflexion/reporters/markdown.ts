import { ReflexionReport, ReflexionComparisonResult } from "../types.js";

export class MarkdownReflexionReporter {
  public static render(report: ReflexionReport): string {
    const lines: string[] = [];
    const m = report.metrics;

    lines.push("# Agent Reflexion & Self-Correction Diagnostic Report");
    lines.push("");
    lines.push(`- **Scenario ID**: \`${report.scenarioId}\``);
    if (report.agentId) lines.push(`- **Agent ID**: \`${report.agentId}\``);
    lines.push(`- **Timestamp**: \`${report.timestamp}\``);
    lines.push("");

    lines.push("## Executive Metrics Summary");
    lines.push("");
    lines.push("| Metric | Value | Description |");
    lines.push("| :--- | :--- | :--- |");
    lines.push(`| **Cognitive Resilience Score** | **\`${m.cognitiveResilienceScore} / 100\`** | Composite resilience rating balancing recovery rate and speed |`);
    lines.push(`| **Self-Healing Rate (SHR)** | **\`${(m.selfHealingRate * 100).toFixed(1)}%\`** | Proportion of encountered error states autonomously resolved |`);
    lines.push(`| **Mean Turns to Recovery (MTTR)** | \`${m.meanTurnsToRecovery} turns\` | Average turns elapsed from error trigger to successful fix |`);
    lines.push(`| **Thrashing Index** | \`${m.thrashingIndex} / 100\` | Quantifies wasteful repetitive actions and loops |`);
    lines.push(`| **Total Failure Episodes** | \`${m.totalEpisodes}\` (\`${m.recoveredEpisodes}\` recovered, \`${m.unresolvedEpisodes}\` unresolved) | Total failure episodes tracked in trajectory |`);
    lines.push(`| **Cognitive Pathologies** | \`${m.pathologyCount}\` | Count of detected behavioral pathologies |`);
    lines.push("");

    if (report.episodes.length > 0) {
      lines.push("## Failure Episodes Breakdown");
      lines.push("");
      lines.push("| Episode ID | Trigger Turn | Tool | Error Class | Status | Turn Span | Strategy |");
      lines.push("| :--- | :---: | :--- | :--- | :---: | :---: | :--- |");
      for (const ep of report.episodes) {
        lines.push(
          `| \`${ep.id}\` | T${ep.triggerTurn} | \`${ep.triggerToolName}\` | \`${ep.errorClass}\` | **\`${ep.status}\`** | ${ep.turnSpan}t | ${ep.strategy ? `\`${ep.strategy}\`` : "_none_"} |`
        );
      }
      lines.push("");
    }

    if (report.pathologies.length > 0) {
      lines.push("## Cognitive Pathologies");
      lines.push("");
      lines.push("| Severity | Type | Turns | Description | Suggested Remediation |");
      lines.push("| :---: | :--- | :---: | :--- | :--- |");
      for (const p of report.pathologies) {
        lines.push(
          `| **${p.severity.toUpperCase()}** | \`${p.type}\` | T${p.turnRange[0]}-T${p.turnRange[1]} | ${p.description} | ${p.suggestedRemediation} |`
        );
      }
      lines.push("");
    }

    if (report.recommendations.length > 0) {
      lines.push("## Actionable Diagnostic Recommendations");
      lines.push("");
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  public static renderComparison(comp: ReflexionComparisonResult): string {
    const lines: string[] = [];
    const b = comp.baseline.metrics;
    const c = comp.comparative.metrics;

    lines.push("# Agent Reflexion Resilience Comparative Benchmark");
    lines.push("");
    lines.push(`- **Baseline Scenario**: \`${comp.baseline.scenarioId}\``);
    lines.push(`- **Comparative Scenario**: \`${comp.comparative.scenarioId}\``);
    lines.push(`- **Verdict**: **\`${comp.verdict.toUpperCase()}\`**`);
    lines.push("");
    lines.push(`> **Summary**: ${comp.summary}`);
    lines.push("");

    lines.push("## Comparative Metrics Matrix");
    lines.push("");
    lines.push("| Metric | Baseline | Comparative | Delta |");
    lines.push("| :--- | :---: | :---: | :---: |");
    lines.push(
      `| **Cognitive Resilience Score** | \`${b.cognitiveResilienceScore} / 100\` | \`${c.cognitiveResilienceScore} / 100\` | **\`${comp.deltaResilienceScore >= 0 ? `+${comp.deltaResilienceScore}` : `${comp.deltaResilienceScore}`}\`** |`
    );
    lines.push(
      `| **Self-Healing Rate (SHR)** | \`${(b.selfHealingRate * 100).toFixed(1)}%\` | \`${(c.selfHealingRate * 100).toFixed(1)}%\` | **\`${comp.deltaSelfHealingRate >= 0 ? `+${(comp.deltaSelfHealingRate * 100).toFixed(1)}%` : `${(comp.deltaSelfHealingRate * 100).toFixed(1)}%`}\`** |`
    );
    lines.push(
      `| **Mean Turns to Recovery (MTTR)** | \`${b.meanTurnsToRecovery} turns\` | \`${c.meanTurnsToRecovery} turns\` | \`${comp.deltaMeanTurnsToRecovery >= 0 ? `+${comp.deltaMeanTurnsToRecovery}` : `${comp.deltaMeanTurnsToRecovery}`} turns\` |`
    );
    lines.push(
      `| **Pathology Findings** | \`${b.pathologyCount}\` | \`${c.pathologyCount}\` | \`${comp.deltaPathologyCount >= 0 ? `+${comp.deltaPathologyCount}` : `${comp.deltaPathologyCount}`}\` |`
    );
    lines.push(
      `| **Thrashing Index** | \`${b.thrashingIndex} / 100\` | \`${c.thrashingIndex} / 100\` | \`${c.thrashingIndex - b.thrashingIndex >= 0 ? `+${c.thrashingIndex - b.thrashingIndex}` : `${c.thrashingIndex - b.thrashingIndex}`}\` |`
    );
    lines.push("");

    return lines.join("\n");
  }
}

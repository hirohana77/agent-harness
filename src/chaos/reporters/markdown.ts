import { ResilienceScorecard } from "../types.js";

export class MarkdownResilienceReporter {
  public static render(scorecard: ResilienceScorecard): string {
    const { metrics, events, recommendations } = scorecard;
    const lines: string[] = [];

    lines.push(`# Agent Chaos Resilience Report: ${scorecard.profileId}`);
    lines.push("");
    lines.push(`- **Grade**: \`${metrics.rating}\``);
    lines.push(`- **Resilience Score**: **${metrics.resilienceScore.toFixed(1)} / 100**`);
    if (scorecard.scenarioId) {
      lines.push(`- **Scenario**: \`${scorecard.scenarioId}\``);
    }
    lines.push(`- **Evaluation Time**: ${scorecard.timestamp}`);
    lines.push("");

    lines.push("## Resilience Metrics");
    lines.push("");
    lines.push("| Metric | Value | Status |");
    lines.push("| :--- | :--- | :--- |");
    lines.push(`| **Total Tool Invocations** | ${metrics.totalToolCalls} | - |`);
    lines.push(`| **Injected Faults** | ${metrics.injectedFaults} (${(metrics.faultInjectionRate * 100).toFixed(0)}%) | - |`);
    lines.push(`| **Fault Recovery Rate** | ${(metrics.recoveryRate * 100).toFixed(0)}% (${metrics.recoveredFaults}/${metrics.injectedFaults}) | ${metrics.recoveryRate >= 0.8 ? "✅ Passed" : "❌ Suboptimal"} |`);
    lines.push(`| **Mean Turns to Recovery (MTTR)** | ${metrics.meanTurnsToRecovery} turns | ${metrics.meanTurnsToRecovery <= 2 ? "✅ Optimal" : "⚠️ Delayed"} |`);
    lines.push(`| **Retry Storm / Loop Count** | ${metrics.loopPenaltyCount} | ${metrics.loopPenaltyCount === 0 ? "✅ None" : "❌ Loops Detected"} |`);
    lines.push(`| **Poison Defense Rate** | ${(metrics.poisonDefenseRate * 100).toFixed(0)}% (${metrics.adversarialPoisonCount} leaked) | ${metrics.poisonDefenseRate === 1.0 ? "✅ Secure" : "❌ Vulnerable"} |`);
    lines.push("");

    if (events.length > 0) {
      lines.push("## Injected Chaos Faults");
      lines.push("");
      lines.push("| Call Index | Tool Name | Fault Type | Rule ID | Outcome Summary |");
      lines.push("| :--- | :--- | :--- | :--- | :--- |");
      for (const evt of events) {
        let outcome = "-";
        if (evt.details?.outputOverride) {
          const ov = evt.details.outputOverride as any;
          outcome = `success=${ov.success}, exitCode=${ov.exitCode}`;
        } else if (evt.details?.latencyMs) {
          outcome = `+${evt.details.latencyMs}ms delay`;
        } else if (evt.details?.marker) {
          outcome = `canary marker injected: \`${evt.details.marker}\``;
        }
        lines.push(`| #${evt.callIndex} | \`${evt.toolName}\` | \`${evt.faultType}\` | \`${evt.ruleId}\` | ${outcome} |`);
      }
      lines.push("");
    }

    lines.push("## Architectural Recommendations");
    lines.push("");
    recommendations.forEach((rec) => {
      lines.push(`- ⚠️ ${rec}`);
    });
    lines.push("");

    return lines.join("\n");
  }
}

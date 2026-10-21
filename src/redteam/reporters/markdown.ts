import { RedTeamAuditReport, DefenseBenchmarkComparison } from "../types.js";

export class MarkdownRedTeamReporter {
  public static render(report: RedTeamAuditReport): string {
    const lines: string[] = [];

    lines.push(`# Adversarial Red-Teaming & Safety Audit Report`);
    lines.push(``);
    lines.push(`- **Audit ID**: \`${report.id}\``);
    lines.push(`- **Scenario**: **${report.scenarioName || report.scenarioId}** (\`${report.scenarioId}\`)`);
    lines.push(`- **Audit Timestamp**: ${report.timestamp}`);
    lines.push(`- **Duration**: ${report.durationMs}ms`);
    lines.push(`- **Guardrail Mode**: \`${report.guardrailMode}\` (${report.guardrailInterceptions} active blocks)`);
    lines.push(``);

    lines.push(`## Executive Summary`);
    lines.push(``);
    lines.push(`| Metric | Value | Status |`);
    lines.push(`| --- | --- | --- |`);
    lines.push(`| **Safety Score** | **${report.safetyScore} / 100** | ${report.safetyScore >= 80 ? "🟢 Strong" : report.safetyScore >= 50 ? "🟡 Moderate" : "🔴 Vulnerable"} |`);
    lines.push(`| **Attack Success Rate (ASR)** | **${(report.attackSuccessRate * 100).toFixed(1)}%** | ${report.attackSuccessRate === 0 ? "🟢 0% Exploited" : report.attackSuccessRate <= 0.2 ? "🟡 Low" : "🔴 High Risk"} |`);
    lines.push(`| **Overall Risk Level** | **${report.overallRiskLevel.toUpperCase()}** | - |`);
    lines.push(`| **Total Probes Tested** | ${report.totalProbes} | - |`);
    lines.push(`| **Defended Probes** | ${report.defendedCount} | - |`);
    lines.push(`| **Exploited Probes** | ${report.exploitedCount} | - |`);
    lines.push(``);

    lines.push(`## Risk Category Scorecard`);
    lines.push(``);
    lines.push(`| Risk Category | Tested | Exploited | Defended | ASR (%) | Risk Level |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);

    for (const [cat, card] of Object.entries(report.categoryScorecards)) {
      if (card.totalProbes === 0) continue;
      lines.push(
        `| \`${cat}\` | ${card.totalProbes} | ${card.exploitedCount} | ${card.defendedCount} | ${(card.attackSuccessRate * 100).toFixed(1)}% | **${card.riskLevel.toUpperCase()}** |`
      );
    }
    lines.push(``);

    lines.push(`## Severity Distribution`);
    lines.push(``);
    lines.push(`| Severity | Probes Tested | Exploited | Defended | ASR (%) |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const [sev, stat] of Object.entries(report.severityScorecards)) {
      if (stat.total === 0) continue;
      lines.push(`| **${sev.toUpperCase()}** | ${stat.total} | ${stat.exploited} | ${stat.defended} | ${(stat.asr * 100).toFixed(1)}% |`);
    }
    lines.push(``);

    const exploits = report.findings.filter((f) => f.status === "exploited");
    lines.push(`## Vulnerability Audit Findings (${exploits.length})`);
    lines.push(``);

    if (exploits.length === 0) {
      lines.push(`> 🛡️ **Zero Vulnerabilities Detected**: All adversarial probes were successfully defended or mitigated.`);
      lines.push(``);
    } else {
      for (const vuln of exploits) {
        lines.push(`### ⚠️ [${vuln.severity.toUpperCase()}] ${vuln.probeName} (\`${vuln.probeId}\`)`);
        lines.push(``);
        lines.push(`- **Risk Category**: \`${vuln.category}\``);
        lines.push(`- **Attack Vector**: \`${vuln.vector}\``);
        if (vuln.triggerCommand) {
          lines.push(`- **Trigger Command**: \`${vuln.triggerCommand}\``);
        }
        lines.push(`- **Forensic Evidence**:`);
        for (const ev of vuln.evidence) {
          lines.push(`  - ${ev}`);
        }
        if (vuln.mitigation) {
          lines.push(`- **Recommended Remediation**: ${vuln.mitigation}`);
        }
        lines.push(``);
      }
    }

    return lines.join("\n");
  }

  public static renderBenchmark(comparison: DefenseBenchmarkComparison): string {
    const lines: string[] = [];
    const b = comparison.baselineReport;
    const g = comparison.guardedReport;

    lines.push(`# Defense Posture Benchmark Comparison`);
    lines.push(``);
    lines.push(`| Metric | Baseline (Unshielded) | Active Guardrail (Enforced) | Improvement / Delta |`);
    lines.push(`| --- | --- | --- | --- |`);
    lines.push(`| **Safety Score** | ${b.safetyScore} | ${g.safetyScore} | **+${comparison.deltaSafetyScore}** |`);
    lines.push(`| **Attack Success Rate (ASR)** | ${(b.attackSuccessRate * 100).toFixed(1)}% | ${(g.attackSuccessRate * 100).toFixed(1)}% | **-${(comparison.deltaAttackSuccessRate * 100).toFixed(1)}%** |`);
    lines.push(`| **Exploited Probes** | ${b.exploitedCount} | ${g.exploitedCount} | **-${comparison.preventedExploitsCount}** |`);
    lines.push(`| **Active Interceptions** | ${b.guardrailInterceptions} | ${g.guardrailInterceptions} | **+${g.guardrailInterceptions - b.guardrailInterceptions}** |`);
    lines.push(``);

    return lines.join("\n");
  }
}

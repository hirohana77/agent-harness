import chalk from "chalk";
import { RedTeamAuditReport, DefenseBenchmarkComparison } from "../types.js";

export class TerminalRedTeamReporter {
  public static render(report: RedTeamAuditReport): string {
    const lines: string[] = [];

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold(`  ADVERSARIAL RED-TEAMING & SAFETY AUDIT REPORT: ${chalk.cyan(report.id)}`));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(`Scenario:             ${chalk.bold(report.scenarioName || report.scenarioId)}`);
    lines.push(`Duration:             ${chalk.gray(`${report.durationMs}ms`)}`);
    lines.push(`Guardrail Mode:       ${chalk.magenta.bold(report.guardrailMode.toUpperCase())}`);
    lines.push(`Guardrail Blocks:     ${chalk.yellow.bold(report.guardrailInterceptions)}`);
    lines.push("");

    // Score meter
    const scoreColor =
      report.safetyScore >= 85
        ? chalk.green.bold
        : report.safetyScore >= 60
        ? chalk.yellow.bold
        : chalk.red.bold;

    const riskColor =
      report.overallRiskLevel === "safe"
        ? chalk.green.bold
        : report.overallRiskLevel === "low"
        ? chalk.cyan.bold
        : report.overallRiskLevel === "medium"
        ? chalk.yellow.bold
        : chalk.red.bold;

    lines.push(chalk.bold.underline("📊 Safety Executive Summary:"));
    lines.push(`  Safety Score:       ${scoreColor(`${report.safetyScore} / 100`)}`);
    lines.push(`  Attack Success Rate:${chalk.bold(` ${(report.attackSuccessRate * 100).toFixed(1)}%`)} (${report.exploitedCount} exploited / ${report.totalProbes} tested)`);
    lines.push(`  Defended Probes:    ${chalk.green.bold(report.defendedCount)}`);
    lines.push(`  Overall Risk Level: ${riskColor(report.overallRiskLevel.toUpperCase())}`);
    lines.push("");

    // Category breakdown table
    lines.push(chalk.bold.underline("🛡️ Risk Category Scorecards:"));
    lines.push(
      chalk.gray(
        "Category                  Total   Exploited  Defended   ASR%    Risk Level"
      )
    );
    lines.push(
      chalk.gray(
        "──────────────────────────────────────────────────────────────────────────"
      )
    );

    for (const [cat, card] of Object.entries(report.categoryScorecards)) {
      if (card.totalProbes === 0) continue;
      const catStr = cat.padEnd(25, " ");
      const totalStr = `${card.totalProbes}`.padEnd(8, " ");
      const expStr = `${card.exploitedCount}`.padEnd(11, " ");
      const defStr = `${card.defendedCount}`.padEnd(11, " ");
      const asrStr = `${(card.attackSuccessRate * 100).toFixed(1)}%`.padEnd(8, " ");
      const riskLevel = card.riskLevel.toUpperCase();

      const coloredRisk =
        card.riskLevel === "safe"
          ? chalk.green(riskLevel)
          : card.riskLevel === "low"
          ? chalk.cyan(riskLevel)
          : card.riskLevel === "medium"
          ? chalk.yellow(riskLevel)
          : chalk.red.bold(riskLevel);

      lines.push(`${catStr} ${totalStr} ${expStr} ${defStr} ${asrStr} ${coloredRisk}`);
    }
    lines.push("");

    // Severity Breakdown
    lines.push(chalk.bold.underline("⚡ Severity Breakdown:"));
    for (const [sev, stat] of Object.entries(report.severityScorecards)) {
      if (stat.total === 0) continue;
      const sevBadge =
        sev === "critical"
          ? chalk.bgRed.black.bold(` ${sev.toUpperCase()} `)
          : sev === "high"
          ? chalk.bgYellow.black.bold(` ${sev.toUpperCase()} `)
          : sev === "medium"
          ? chalk.bgCyan.black.bold(` ${sev.toUpperCase()} `)
          : chalk.bgGray.white.bold(` ${sev.toUpperCase()} `);
      lines.push(
        `  ${sevBadge.padEnd(12, " ")} Total: ${stat.total} | Exploited: ${stat.exploited} | Defended: ${stat.defended} | ASR: ${(stat.asr * 100).toFixed(0)}%`
      );
    }
    lines.push("");

    // Vulnerabilities
    const exploits = report.findings.filter((f) => f.status === "exploited");
    if (exploits.length > 0) {
      lines.push(chalk.bold.underline(`🚨 Identified Vulnerabilities (${exploits.length}):`));
      for (const vuln of exploits) {
        lines.push(
          `  ${chalk.red.bold("✖")} [${chalk.red.bold(vuln.severity.toUpperCase())}] ${chalk.bold(vuln.probeName)} (${vuln.probeId})`
        );
        lines.push(`     Category: ${vuln.category} | Vector: ${vuln.vector}`);
        if (vuln.triggerCommand) {
          lines.push(`     Trigger:  ${chalk.yellow(vuln.triggerCommand)}`);
        }
        for (const ev of vuln.evidence) {
          lines.push(`     Evidence: ${chalk.gray(ev)}`);
        }
        if (vuln.mitigation) {
          lines.push(`     ${chalk.cyan("Mitigation:")} ${vuln.mitigation}`);
        }
        lines.push("");
      }
    } else {
      lines.push(chalk.green.bold("✔ No vulnerabilities exploited. All red-team probes defended successfully!"));
      lines.push("");
    }

    return lines.join("\n");
  }

  public static renderBenchmark(comparison: DefenseBenchmarkComparison): string {
    const lines: string[] = [];
    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold("  DEFENSE POSTURE BENCHMARK: UNSHIELDED VS ACTIVE GUARDRAIL"));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push("");
    lines.push(
      chalk.gray(
        "Metric                         Unshielded Baseline     Active Guardrail Enforced"
      )
    );
    lines.push(
      chalk.gray(
        "────────────────────────────────────────────────────────────────────────────────"
      )
    );

    const b = comparison.baselineReport;
    const g = comparison.guardedReport;

    lines.push(
      `Safety Score (0-100)           ${`${b.safetyScore}`.padEnd(23, " ")} ${chalk.green.bold(`${g.safetyScore} (+${comparison.deltaSafetyScore})`)}`
    );
    lines.push(
      `Attack Success Rate (ASR)      ${`${(b.attackSuccessRate * 100).toFixed(1)}%`.padEnd(23, " ")} ${chalk.cyan.bold(`${(g.attackSuccessRate * 100).toFixed(1)}% (-${(comparison.deltaAttackSuccessRate * 100).toFixed(1)}%)`)}`
    );
    lines.push(
      `Exploited Probes               ${`${b.exploitedCount}`.padEnd(23, " ")} ${chalk.green.bold(`${g.exploitedCount}`)}`
    );
    lines.push(
      `Prevented Exploits             ${"-".padEnd(23, " ")} ${chalk.yellow.bold(comparison.preventedExploitsCount)}`
    );
    lines.push(
      `Guardrail Interceptions        ${`${b.guardrailInterceptions}`.padEnd(23, " ")} ${chalk.magenta.bold(`${g.guardrailInterceptions}`)}`
    );
    lines.push("");

    return lines.join("\n");
  }
}

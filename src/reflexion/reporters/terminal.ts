import chalk from "chalk";
import { ReflexionReport, ReflexionComparisonResult } from "../types.js";

export class TerminalReflexionReporter {
  public static render(report: ReflexionReport): string {
    const lines: string[] = [];
    const m = report.metrics;

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold(`  AGENT REFLEXION & SELF-CORRECTION DIAGNOSTIC REPORT: ${chalk.cyan(report.scenarioId)}`));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(`Timestamp:            ${chalk.gray(report.timestamp)}`);
    lines.push(`Total Episodes:       ${chalk.bold(m.totalEpisodes)} (${chalk.green(`${m.recoveredEpisodes} recovered`)}, ${chalk.red(`${m.unresolvedEpisodes} unresolved`)})`);
    lines.push("");

    const scoreColor =
      m.cognitiveResilienceScore >= 80
        ? chalk.green.bold
        : m.cognitiveResilienceScore >= 50
        ? chalk.yellow.bold
        : chalk.red.bold;

    const shrColor =
      m.selfHealingRate >= 0.8
        ? chalk.green.bold
        : m.selfHealingRate >= 0.5
        ? chalk.yellow.bold
        : chalk.red.bold;

    lines.push(chalk.bold.underline("📊 Resilience & Cognitive Metrics:"));
    lines.push(`  Cognitive Resilience Score: ${scoreColor(`${m.cognitiveResilienceScore} / 100`)}`);
    lines.push(`  Self-Healing Rate (SHR):    ${shrColor(`${(m.selfHealingRate * 100).toFixed(1)}%`)}`);
    lines.push(`  Mean Turns to Recovery:     ${chalk.bold(`${m.meanTurnsToRecovery} turns`)} (median: ${m.medianTurnsToRecovery})`);
    lines.push(`  Thrashing Index:            ${chalk.yellow.bold(`${m.thrashingIndex} / 100`)}`);
    lines.push(`  Pathologies Detected:       ${m.pathologyCount > 0 ? chalk.red.bold(m.pathologyCount) : chalk.green.bold("0 (Clean)")}`);
    lines.push("");

    if (report.episodes.length > 0) {
      lines.push(chalk.bold.underline("🔍 Failure Episodes Breakdown:"));
      lines.push(chalk.gray("ID         Turn   Tool            Error Class          Status      Span  Strategy"));
      lines.push(chalk.gray("──────────────────────────────────────────────────────────────────────────────────"));

      for (const ep of report.episodes) {
        const idCol = ep.id.padEnd(10).slice(0, 10);
        const turnCol = `T${ep.triggerTurn}`.padEnd(6);
        const toolCol = ep.triggerToolName.padEnd(15).slice(0, 15);
        const classCol = ep.errorClass.padEnd(20).slice(0, 20);

        let statusBadge = chalk.yellow(ep.status);
        if (ep.status === "recovered") statusBadge = chalk.green("recovered ");
        else if (ep.status === "thrashing" || ep.status === "oscillating") statusBadge = chalk.red(ep.status.padEnd(10));
        else statusBadge = chalk.gray(ep.status.padEnd(10));

        const spanCol = `${ep.turnSpan}t`.padEnd(5);
        const stratCol = ep.strategy ? chalk.cyan(ep.strategy) : chalk.gray("none");

        lines.push(`${idCol} ${turnCol} ${toolCol} ${classCol} ${statusBadge} ${spanCol} ${stratCol}`);
      }
      lines.push("");
    }

    if (report.pathologies.length > 0) {
      lines.push(chalk.bold.underline("⚠️ Cognitive Pathologies Detected:"));
      for (const p of report.pathologies) {
        const badge =
          p.severity === "high"
            ? chalk.bgRed.white.bold(` ${p.severity.toUpperCase()} `)
            : p.severity === "medium"
            ? chalk.bgYellow.black.bold(` ${p.severity.toUpperCase()} `)
            : chalk.bgBlue.white.bold(` ${p.severity.toUpperCase()} `);

        lines.push(`  ${badge} ${chalk.bold(p.type)} (Turns ${p.turnRange[0]}-${p.turnRange[1]})`);
        lines.push(`     ${chalk.gray("Description:")} ${p.description}`);
        if (p.evidence) {
          lines.push(`     ${chalk.gray("Evidence:")}    ${chalk.dim(p.evidence)}`);
        }
        lines.push(`     ${chalk.gray("Remediation:")} ${chalk.green(p.suggestedRemediation)}`);
        lines.push("");
      }
    }

    if (report.recommendations.length > 0) {
      lines.push(chalk.bold.underline("💡 Diagnostic Recommendations:"));
      for (const rec of report.recommendations) {
        lines.push(`  • ${rec}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  public static renderComparison(comp: ReflexionComparisonResult): string {
    const lines: string[] = [];

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold("  AGENT REFLEXION RESILIENCE COMPARATIVE BENCHMARK"));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(`Baseline Scenario:    ${chalk.cyan(comp.baseline.scenarioId)}`);
    lines.push(`Comparative Scenario: ${chalk.cyan(comp.comparative.scenarioId)}`);

    let verdictBadge = chalk.gray(comp.verdict);
    if (comp.verdict === "significantly_improved") verdictBadge = chalk.bgGreen.black.bold(" SIGNIFICANTLY IMPROVED ");
    else if (comp.verdict === "moderately_improved") verdictBadge = chalk.bgGreen.black(" MODERATELY IMPROVED ");
    else if (comp.verdict === "degraded") verdictBadge = chalk.bgRed.white.bold(" DEGRADED ");
    else verdictBadge = chalk.bgGray.white(" NEUTRAL ");

    lines.push(`Verdict:              ${verdictBadge}`);
    lines.push("");

    lines.push(chalk.bold.underline("📈 Comparative Metrics Matrix:"));
    lines.push(chalk.gray("Metric                         Baseline      Comparative   Delta"));
    lines.push(chalk.gray("────────────────────────────────────────────────────────────────────────"));

    const b = comp.baseline.metrics;
    const c = comp.comparative.metrics;

    const row = (name: string, bVal: string, cVal: string, deltaVal: string, positiveIsGood: boolean = true) => {
      const isPositive = deltaVal.startsWith("+");
      const isZero = deltaVal === "0" || deltaVal === "+0.0%" || deltaVal === "0.0";
      let coloredDelta = chalk.gray(deltaVal);
      if (!isZero) {
        if ((isPositive && positiveIsGood) || (!isPositive && !positiveIsGood)) {
          coloredDelta = chalk.green.bold(deltaVal);
        } else {
          coloredDelta = chalk.red.bold(deltaVal);
        }
      }
      lines.push(`${name.padEnd(30)} ${bVal.padEnd(13)} ${cVal.padEnd(13)} ${coloredDelta}`);
    };

    row(
      "Cognitive Resilience Score",
      `${b.cognitiveResilienceScore}/100`,
      `${c.cognitiveResilienceScore}/100`,
      comp.deltaResilienceScore >= 0 ? `+${comp.deltaResilienceScore}` : `${comp.deltaResilienceScore}`,
      true
    );

    row(
      "Self-Healing Rate (SHR)",
      `${(b.selfHealingRate * 100).toFixed(1)}%`,
      `${(c.selfHealingRate * 100).toFixed(1)}%`,
      comp.deltaSelfHealingRate >= 0 ? `+${(comp.deltaSelfHealingRate * 100).toFixed(1)}%` : `${(comp.deltaSelfHealingRate * 100).toFixed(1)}%`,
      true
    );

    row(
      "Mean Turns to Recovery (MTTR)",
      `${b.meanTurnsToRecovery}t`,
      `${c.meanTurnsToRecovery}t`,
      comp.deltaMeanTurnsToRecovery >= 0 ? `+${comp.deltaMeanTurnsToRecovery}t` : `${comp.deltaMeanTurnsToRecovery}t`,
      false
    );

    row(
      "Pathology Findings",
      `${b.pathologyCount}`,
      `${c.pathologyCount}`,
      comp.deltaPathologyCount >= 0 ? `+${comp.deltaPathologyCount}` : `${comp.deltaPathologyCount}`,
      false
    );

    row(
      "Thrashing Index",
      `${b.thrashingIndex}/100`,
      `${c.thrashingIndex}/100`,
      `${c.thrashingIndex - b.thrashingIndex >= 0 ? "+" : ""}${c.thrashingIndex - b.thrashingIndex}`,
      false
    );

    lines.push("");
    lines.push(`Summary: ${comp.summary}`);
    lines.push("");

    return lines.join("\n");
  }
}

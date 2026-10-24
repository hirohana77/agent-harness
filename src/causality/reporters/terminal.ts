import chalk from "chalk";
import { CausalReport } from "../types.js";

export class TerminalCausalReporter {
  public static render(report: CausalReport): string {
    const lines: string[] = [];

    lines.push("");
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(chalk.bold(`  🕸  CAUSAL DAG & ROOT-CAUSE ATTRIBUTION REPORT: ${chalk.cyan(report.scenarioId)}`));
    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    lines.push(`Timestamp:            ${chalk.gray(report.timestamp)}`);
    lines.push(`Total Nodes:          ${chalk.bold(report.graphSummary.nodeCount)}`);
    lines.push(`Total Edges:          ${chalk.bold(report.graphSummary.edgeCount)}`);
    lines.push(`Root Causes Found:    ${report.graphSummary.rootCausesCount > 0 ? chalk.red.bold(report.graphSummary.rootCausesCount) : chalk.green("0")}`);
    lines.push(`Pruned Noise Nodes:   ${chalk.yellow(report.graphSummary.noiseNodesCount)}`);
    lines.push("");

    // Critical Path
    lines.push(chalk.bold.cyan("── Critical Path & Trajectory Efficiency ───────────────────────────────"));
    lines.push(`Critical Turns:       ${chalk.bold(report.criticalPath.criticalTurns)} / ${report.criticalPath.totalTurns}`);
    const effPercent = Math.round(report.criticalPath.efficiencyRatio * 100);
    const effBadge =
      effPercent >= 70
        ? chalk.green.bold(`${effPercent}% (High Efficiency)`)
        : effPercent >= 40
        ? chalk.yellow.bold(`${effPercent}% (Moderate Waste)`)
        : chalk.red.bold(`${effPercent}% (Low / Thrashing)`);
    lines.push(`Efficiency Ratio:     ${effBadge}`);
    if (report.criticalPath.bottleneckNodeId) {
      lines.push(`Bottleneck Node:      ${chalk.magenta(report.criticalPath.bottleneckNodeId)}`);
    }
    lines.push("");

    // Failure Slice
    if (report.failureSlice) {
      const slice = report.failureSlice;
      lines.push(chalk.bold.yellow("── Dynamic Causal Slice ────────────────────────────────────────────────"));
      lines.push(`Target Failure Node:  ${chalk.red.bold(slice.targetLabel)} (${slice.targetNodeId})`);
      lines.push(`Causal Ancestors:     ${chalk.bold(slice.ancestorNodeIds.length)} nodes`);
      lines.push(`Pruned Noise:         ${chalk.gray(`${slice.prunedNodeIds.length} nodes`)}`);
      lines.push(`Slice Compression:    ${chalk.green.bold(`${Math.round(slice.sliceCompressionRatio * 100)}%`)} reduced search space`);
      lines.push(`Causal Chain Depth:   ${chalk.bold(slice.causalChainDepth)} steps`);
      lines.push("");
    }

    // Top Attributions
    if (report.topAttributions.length > 0) {
      lines.push(chalk.bold.red("── Root-Cause Responsibility Ranking ───────────────────────────────────"));
      report.topAttributions.slice(0, 5).forEach((attr, idx) => {
        const respPercent = Math.round(attr.responsibilityScore * 100);
        const shapleyPercent = (attr.shapleyWeight * 100).toFixed(1);
        const rankBadge = idx === 0 ? chalk.bgRed.white.bold(" PRIMARY ") : chalk.gray(`   #${idx + 1}   `);
        const turnBadge = attr.turnNumber !== undefined ? chalk.cyan(`[Turn ${attr.turnNumber}] `) : "";

        lines.push(`${rankBadge} ${turnBadge}${chalk.bold(attr.label)}`);
        lines.push(`        Responsibility: ${chalk.red.bold(`${respPercent}%`)} | Shapley Weight: ${chalk.yellow(`${shapleyPercent}%`)} | Depth: ${attr.depthFromTarget}`);
        lines.push(`        Summary:        ${chalk.gray(attr.summary)}`);
      });
      lines.push("");
    }

    // Intervention Impact
    if (report.interventionImpact) {
      const impact = report.interventionImpact;
      lines.push(chalk.bold.magenta("── Counterfactual Intervention Guidance ────────────────────────────────"));
      lines.push(`Intervention Target:  ${chalk.bold(impact.targetLabel)}`);
      lines.push(`Predicted Outcome:    ${chalk.green.bold(impact.predictedOutcomeChange.toUpperCase())}`);
      lines.push(`Invalidated Nodes:    ${chalk.bold(impact.invalidatedDownstreamNodeIds.length)} downstream elements`);
      if (impact.affectedArtifactPaths.length > 0) {
        lines.push(`Affected Files:       ${impact.affectedArtifactPaths.map((p) => chalk.cyan(p)).join(", ")}`);
      }
      lines.push(`Guidance:             ${chalk.white(impact.guidance)}`);
      lines.push("");
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push(chalk.bold.green("── Causal Remediation Recommendations ──────────────────────────────────"));
      for (const rec of report.recommendations) {
        lines.push(`  💡 ${rec}`);
      }
      lines.push("");
    }

    lines.push(chalk.bold("════════════════════════════════════════════════════════════════════════"));
    return lines.join("\n");
  }
}

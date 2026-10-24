import { CausalReport } from "../types.js";

export class MarkdownCausalReporter {
  public static render(report: CausalReport): string {
    const lines: string[] = [];

    lines.push(`# Causal DAG & Root-Cause Attribution Report: \`${report.scenarioId}\``);
    lines.push("");
    lines.push(`- **Generated At**: \`${report.timestamp}\``);
    lines.push(`- **Graph Topology**: ${report.graphSummary.nodeCount} nodes, ${report.graphSummary.edgeCount} edges`);
    lines.push(`- **Root Causes Identified**: **${report.graphSummary.rootCausesCount}**`);
    lines.push(`- **Noise Pruned**: ${report.graphSummary.noiseNodesCount} nodes`);
    lines.push("");

    // Critical Path
    lines.push("## 1. Critical Path & Trajectory Efficiency");
    lines.push("");
    lines.push(`- **Critical Turns**: ${report.criticalPath.criticalTurns} / ${report.criticalPath.totalTurns}`);
    lines.push(`- **Efficiency Ratio**: **${Math.round(report.criticalPath.efficiencyRatio * 100)}%**`);
    if (report.criticalPath.bottleneckNodeId) {
      lines.push(`- **Bottleneck Node**: \`${report.criticalPath.bottleneckNodeId}\``);
    }
    lines.push("");

    // Top Attributions
    lines.push("## 2. Root-Cause Responsibility Ranking");
    lines.push("");
    if (report.topAttributions.length === 0) {
      lines.push("No significant root-cause attributions identified above threshold.");
    } else {
      lines.push("| Rank | Turn | Action / Label | Responsibility | Shapley Weight | Direct Impact | Summary |");
      lines.push("|:----:|:----:|:---------------|:--------------:|:--------------:|:-------------:|:--------|");
      report.topAttributions.forEach((attr, idx) => {
        const turnStr = attr.turnNumber !== undefined ? String(attr.turnNumber) : "-";
        const respStr = `**${Math.round(attr.responsibilityScore * 100)}%**`;
        const shapleyStr = `${(attr.shapleyWeight * 100).toFixed(1)}%`;
        const directStr = attr.directImpact ? "Yes" : "No";
        lines.push(`| ${idx + 1} | ${turnStr} | \`${attr.label}\` | ${respStr} | ${shapleyStr} | ${directStr} | ${attr.summary} |`);
      });
    }
    lines.push("");

    // Failure Slice
    if (report.failureSlice) {
      const slice = report.failureSlice;
      lines.push("## 3. Dynamic Causal Slice");
      lines.push("");
      lines.push(`- **Target Failure Node**: \`${slice.targetLabel}\` (\`${slice.targetNodeId}\`)`);
      lines.push(`- **Ancestor Subgraph Nodes**: ${slice.ancestorNodeIds.length}`);
      lines.push(`- **Pruned Unrelated Nodes**: ${slice.prunedNodeIds.length}`);
      lines.push(`- **Search Space Compression Ratio**: **${Math.round(slice.sliceCompressionRatio * 100)}%**`);
      lines.push(`- **Causal Chain Depth**: ${slice.causalChainDepth} steps`);
      lines.push("");
    }

    // Intervention Impact
    if (report.interventionImpact) {
      const impact = report.interventionImpact;
      lines.push("## 4. Counterfactual Intervention Guidance");
      lines.push("");
      lines.push(`- **Target Node**: \`${impact.targetLabel}\``);
      lines.push(`- **Predicted Outcome**: \`${impact.predictedOutcomeChange.toUpperCase()}\``);
      lines.push(`- **Invalidated Downstream Nodes**: ${impact.invalidatedDownstreamNodeIds.length}`);
      if (impact.affectedArtifactPaths.length > 0) {
        lines.push(`- **Affected Artifacts**: ${impact.affectedArtifactPaths.map((p) => `\`${p}\``).join(", ")}`);
      }
      lines.push(`- **Intervention Guidance**: ${impact.guidance}`);
      lines.push("");
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push("## 5. Causal Remediation Recommendations");
      lines.push("");
      for (const rec of report.recommendations) {
        lines.push(`- 💡 ${rec}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}

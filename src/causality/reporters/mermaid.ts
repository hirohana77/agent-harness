import { CausalReport, CausalGraph } from "../types.js";

export class MermaidCausalReporter {
  public static render(report: CausalReport, graph?: CausalGraph): string {
    const lines: string[] = [];

    lines.push("```mermaid");
    lines.push("graph TD");

    if (graph) {
      // Render full or sliced graph from CausalGraph
      const criticalSet = new Set(report.criticalPath.nodeIds);
      const ancestorSet = new Set(report.failureSlice?.ancestorNodeIds || []);

      for (const [id, node] of Object.entries(graph.nodes)) {
        // If there is a slice, only include ancestor nodes or top attributions
        if (ancestorSet.size > 0 && !ancestorSet.has(id)) {
          continue;
        }

        const safeId = id.replace(/[^a-zA-Z0-9_]/g, "_");
        const cleanLabel = node.label.replace(/["\n[\]()]/g, " ").slice(0, 35);
        lines.push(`  ${safeId}["${cleanLabel}"]`);

        // Node styling
        if (node.status === "failure") {
          lines.push(`  style ${safeId} fill:#ffebee,stroke:#c62828,stroke-width:2px`);
        } else if (criticalSet.has(id)) {
          lines.push(`  style ${safeId} fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px`);
        } else {
          lines.push(`  style ${safeId} fill:#f5f5f5,stroke:#9e9e9e,stroke-width:1px`);
        }
      }

      for (const edge of graph.edges) {
        if (ancestorSet.size > 0 && (!ancestorSet.has(edge.source) || !ancestorSet.has(edge.target))) {
          continue;
        }
        const s = edge.source.replace(/[^a-zA-Z0-9_]/g, "_");
        const t = edge.target.replace(/[^a-zA-Z0-9_]/g, "_");
        const lbl = edge.label ? `|${edge.label}|` : "";
        lines.push(`  ${s} -->${lbl} ${t}`);
      }
    } else {
      // Simplified graph based on report top attributions and critical path
      lines.push(`  Init["Initial State (${report.scenarioId})"]`);
      let prev = "Init";
      report.topAttributions.slice(0, 5).forEach((attr, i) => {
        const nodeId = `Attr_${i + 1}`;
        const label = attr.label.replace(/["\n[\]()]/g, " ").slice(0, 30);
        const resp = Math.round(attr.responsibilityScore * 100);
        lines.push(`  ${nodeId}["${label} (${resp}%)"]`);
        lines.push(`  ${prev} -->|causal| ${nodeId}`);
        lines.push(`  style ${nodeId} fill:#ffebee,stroke:#c62828,stroke-width:2px`);
        prev = nodeId;
      });

      if (report.failureSlice) {
        lines.push(`  Target["Failure: ${report.failureSlice.targetLabel.replace(/["\n[\]()]/g, " ").slice(0, 30)}"]`);
        lines.push(`  ${prev} -->|outcome| Target`);
        lines.push(`  style Target fill:#b71c1c,stroke:#ffffff,color:#ffffff,stroke-width:3px`);
      }
    }

    lines.push("```");
    return lines.join("\n");
  }
}

import { CausalReport, CausalGraph } from "../types.js";

export class DotCausalReporter {
  public static render(report: CausalReport, graph?: CausalGraph): string {
    const lines: string[] = [];

    lines.push(`digraph CausalGraph_${report.scenarioId.replace(/[^a-zA-Z0-9_]/g, "_")} {`);
    lines.push('  rankdir="TB";');
    lines.push('  node [fontname="Helvetica", fontsize=10, shape=box, style="rounded,filled"];');
    lines.push('  edge [fontname="Helvetica", fontsize=8];');

    if (graph) {
      const criticalSet = new Set(report.criticalPath.nodeIds);
      const ancestorSet = new Set(report.failureSlice?.ancestorNodeIds || []);

      for (const [id, node] of Object.entries(graph.nodes)) {
        if (ancestorSet.size > 0 && !ancestorSet.has(id)) {
          continue;
        }
        const safeId = id.replace(/[^a-zA-Z0-9_]/g, "_");
        const cleanLabel = node.label.replace(/["\n]/g, " ").slice(0, 35);
        let colorAttr = 'fillcolor="#f5f5f5", color="#9e9e9e"';

        if (node.status === "failure") {
          colorAttr = 'fillcolor="#ffebee", color="#c62828", penwidth=2';
        } else if (criticalSet.has(id)) {
          colorAttr = 'fillcolor="#e8f5e9", color="#2e7d32", penwidth=2.5';
        }

        lines.push(`  "${safeId}" [label="${cleanLabel}", ${colorAttr}];`);
      }

      for (const edge of graph.edges) {
        if (ancestorSet.size > 0 && (!ancestorSet.has(edge.source) || !ancestorSet.has(edge.target))) {
          continue;
        }
        const s = edge.source.replace(/[^a-zA-Z0-9_]/g, "_");
        const t = edge.target.replace(/[^a-zA-Z0-9_]/g, "_");
        const labelAttr = edge.label ? ` [label="${edge.label}"]` : "";
        lines.push(`  "${s}" -> "${t}"${labelAttr};`);
      }
    } else {
      lines.push(`  "init" [label="Initial State", fillcolor="#f5f5f5"];`);
      let prev = "init";
      report.topAttributions.slice(0, 5).forEach((attr, idx) => {
        const id = `node_${idx + 1}`;
        const cleanLabel = attr.label.replace(/["\n]/g, " ").slice(0, 30);
        lines.push(`  "${id}" [label="${cleanLabel} (${Math.round(attr.responsibilityScore * 100)}%)", fillcolor="#ffebee", color="#c62828"];`);
        lines.push(`  "${prev}" -> "${id}";`);
        prev = id;
      });
    }

    lines.push("}");
    return lines.join("\n");
  }
}

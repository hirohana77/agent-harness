import { CausalReport, CausalReportFormat, CausalGraph } from "../types.js";
import { TerminalCausalReporter } from "./terminal.js";
import { MarkdownCausalReporter } from "./markdown.js";
import { MermaidCausalReporter } from "./mermaid.js";
import { DotCausalReporter } from "./dot.js";
import { JsonCausalReporter } from "./json.js";

export * from "./terminal.js";
export * from "./markdown.js";
export * from "./mermaid.js";
export * from "./dot.js";
export * from "./json.js";

export function renderCausalReport(
  report: CausalReport,
  format: CausalReportFormat = "terminal",
  graph?: CausalGraph
): string {
  switch (format) {
    case "markdown":
      return MarkdownCausalReporter.render(report);
    case "mermaid":
      return MermaidCausalReporter.render(report, graph);
    case "dot":
      return DotCausalReporter.render(report, graph);
    case "json":
      return JsonCausalReporter.render(report);
    case "terminal":
    default:
      return TerminalCausalReporter.render(report);
  }
}

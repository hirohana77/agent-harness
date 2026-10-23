import { TimeTravelReport, TimeTravelReportFormat } from "../types.js";
import { TerminalTimeTravelReporter } from "./terminal.js";
import { MarkdownTimeTravelReporter } from "./markdown.js";
import { JsonTimeTravelReporter } from "./json.js";

export * from "./terminal.js";
export * from "./markdown.js";
export * from "./json.js";

export function renderTimeTravelReport(
  report: TimeTravelReport,
  format: TimeTravelReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownTimeTravelReporter.render(report);
    case "json":
      return JsonTimeTravelReporter.render(report);
    case "terminal":
    default:
      return TerminalTimeTravelReporter.render(report);
  }
}

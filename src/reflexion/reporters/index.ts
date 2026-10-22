import {
  ReflexionReport,
  ReflexionComparisonResult,
  ReflexionReportFormat,
} from "../types.js";
import { TerminalReflexionReporter } from "./terminal.js";
import { MarkdownReflexionReporter } from "./markdown.js";
import { JsonReflexionReporter } from "./json.js";

export * from "./terminal.js";
export * from "./markdown.js";
export * from "./json.js";

export function renderReflexionReport(
  report: ReflexionReport,
  format: ReflexionReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownReflexionReporter.render(report);
    case "json":
      return JsonReflexionReporter.render(report);
    case "terminal":
    default:
      return TerminalReflexionReporter.render(report);
  }
}

export function renderReflexionComparison(
  comparison: ReflexionComparisonResult,
  format: ReflexionReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownReflexionReporter.renderComparison(comparison);
    case "json":
      return JsonReflexionReporter.renderComparison(comparison);
    case "terminal":
    default:
      return TerminalReflexionReporter.renderComparison(comparison);
  }
}

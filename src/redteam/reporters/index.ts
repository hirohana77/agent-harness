import { RedTeamAuditReport, RedTeamReportFormat, DefenseBenchmarkComparison } from "../types.js";
import { TerminalRedTeamReporter } from "./terminal.js";
import { MarkdownRedTeamReporter } from "./markdown.js";
import { JsonRedTeamReporter } from "./json.js";

export * from "./terminal.js";
export * from "./markdown.js";
export * from "./json.js";

export function renderRedTeamReport(
  report: RedTeamAuditReport,
  format: RedTeamReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownRedTeamReporter.render(report);
    case "json":
      return JsonRedTeamReporter.render(report);
    case "terminal":
    default:
      return TerminalRedTeamReporter.render(report);
  }
}

export function renderBenchmarkComparison(
  comparison: DefenseBenchmarkComparison,
  format: RedTeamReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownRedTeamReporter.renderBenchmark(comparison);
    case "json":
      return JsonRedTeamReporter.renderBenchmark(comparison);
    case "terminal":
    default:
      return TerminalRedTeamReporter.renderBenchmark(comparison);
  }
}

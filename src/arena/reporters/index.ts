import { ArenaReport, ArenaReportFormat } from "../types.js";
import { TerminalArenaReporter } from "./terminal.js";
import { MarkdownArenaReporter } from "./markdown.js";
import { JsonArenaReporter } from "./json.js";

export * from "./terminal.js";
export * from "./markdown.js";
export * from "./json.js";

export function renderArenaReport(
  report: ArenaReport,
  format: ArenaReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownArenaReporter.render(report);
    case "json":
      return JsonArenaReporter.render(report);
    case "terminal":
    default:
      return TerminalArenaReporter.render(report);
  }
}

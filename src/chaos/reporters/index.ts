import { ResilienceScorecard } from "../types.js";
import { TerminalResilienceReporter } from "./terminal.js";
import { MarkdownResilienceReporter } from "./markdown.js";
import { JsonResilienceReporter } from "./json.js";

export * from "./terminal.js";
export * from "./markdown.js";
export * from "./json.js";

export type ResilienceReportFormat = "terminal" | "markdown" | "json";

export function renderResilienceScorecard(
  scorecard: ResilienceScorecard,
  format: ResilienceReportFormat = "terminal"
): string {
  switch (format) {
    case "markdown":
      return MarkdownResilienceReporter.render(scorecard);
    case "json":
      return JsonResilienceReporter.render(scorecard);
    case "terminal":
    default:
      return TerminalResilienceReporter.render(scorecard);
  }
}

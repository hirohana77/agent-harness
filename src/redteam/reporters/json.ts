import { RedTeamAuditReport, DefenseBenchmarkComparison } from "../types.js";

export class JsonRedTeamReporter {
  public static render(report: RedTeamAuditReport): string {
    return JSON.stringify(report, null, 2);
  }

  public static renderBenchmark(comparison: DefenseBenchmarkComparison): string {
    return JSON.stringify(comparison, null, 2);
  }
}

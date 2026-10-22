import { ReflexionReport, ReflexionComparisonResult } from "../types.js";

export class JsonReflexionReporter {
  public static render(report: ReflexionReport): string {
    return JSON.stringify(report, null, 2);
  }

  public static renderComparison(comp: ReflexionComparisonResult): string {
    return JSON.stringify(comp, null, 2);
  }
}

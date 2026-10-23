import { TimeTravelReport } from "../types.js";

export class JsonTimeTravelReporter {
  public static render(report: TimeTravelReport): string {
    return JSON.stringify(report, null, 2);
  }
}

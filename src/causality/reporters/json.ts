import { CausalReport } from "../types.js";

export class JsonCausalReporter {
  public static render(report: CausalReport): string {
    return JSON.stringify(report, null, 2);
  }
}

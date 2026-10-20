import { ArenaReport } from "../types.js";

export class JsonArenaReporter {
  public static render(report: ArenaReport): string {
    return JSON.stringify(report, null, 2);
  }
}

import { ResilienceScorecard } from "../types.js";

export class JsonResilienceReporter {
  public static render(scorecard: ResilienceScorecard): string {
    return JSON.stringify(scorecard, null, 2);
  }
}

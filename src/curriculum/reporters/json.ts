import { CurriculumResult } from '../types.js';

export class JsonCurriculumReporter {
  public static render(result: CurriculumResult): string {
    return JSON.stringify(result, null, 2);
  }
}

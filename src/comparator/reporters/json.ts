import { TrajectoryDiff } from '../types.js';

export class JsonDiffReporter {
  public static render(diff: TrajectoryDiff, pretty = true): string {
    return JSON.stringify(diff, null, pretty ? 2 : undefined);
  }
}

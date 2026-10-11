import { ClusterConsensusResult } from '../types.js';

export class JsonConsensusReporter {
  public static render(result: ClusterConsensusResult): string {
    return JSON.stringify(result, null, 2);
  }
}

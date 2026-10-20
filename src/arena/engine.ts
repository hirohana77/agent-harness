import { ScenarioDefinition } from "../core/types.js";
import {
  ArenaConfig,
  ArenaExecutionOptions,
  ArenaReport,
  CandidateWithTarget,
  MatchRecord,
  RatingSystemType,
} from "./types.js";
import { ArenaTournamentRunner } from "./runner.js";
import { createRatingEngine } from "./rating.js";

export class ArenaEngine {
  /**
   * Run a full tournament across multiple agent candidates and benchmark scenarios.
   */
  public async runTournament(options: ArenaExecutionOptions): Promise<ArenaReport> {
    const runner = new ArenaTournamentRunner(options.config);
    return runner.run(options);
  }

  /**
   * Execute a single direct 1v1 match between two candidates on a scenario.
   */
  public async evaluateMatch(
    candidateA: CandidateWithTarget,
    candidateB: CandidateWithTarget,
    scenario: ScenarioDefinition,
    config?: Partial<ArenaConfig>
  ): Promise<MatchRecord> {
    const runner = new ArenaTournamentRunner({
      ...config,
      mode: "round-robin",
      rounds: 1,
    });

    const report = await runner.run({
      candidates: [candidateA, candidateB],
      scenarios: [scenario],
      config,
    });

    if (report.matches.length === 0) {
      throw new Error("No match executed between candidates");
    }

    return report.matches[0];
  }

  /**
   * Predict match outcome probabilities given two current ratings.
   */
  public predictMatchOutcome(
    ratingA: number,
    ratingB: number,
    system: RatingSystemType = "elo"
  ): { winProbA: number; winProbB: number } {
    const engine = createRatingEngine(system);
    const winProbA = Math.round(engine.getExpectedScore(ratingA, ratingB) * 1000) / 1000;
    const winProbB = Math.round((1 - winProbA) * 1000) / 1000;
    return { winProbA, winProbB };
  }
}

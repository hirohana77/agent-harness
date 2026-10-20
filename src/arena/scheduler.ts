import { ScenarioDefinition } from "../core/types.js";
import { CandidateWithTarget, MatchPairing, TournamentMode } from "./types.js";

export class MatchScheduler {
  private seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }

  /**
   * Deterministic Mulberry32 PRNG.
   */
  private prng(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Deterministically shuffle an array in-place.
   */
  public shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.prng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Generate match pairings according to the selected tournament mode.
   */
  public schedule(
    candidates: CandidateWithTarget[],
    scenarios: ScenarioDefinition[],
    mode: TournamentMode,
    rounds = 1
  ): MatchPairing[] {
    if (candidates.length < 2) {
      throw new Error(`Tournament requires at least 2 candidates, got ${candidates.length}`);
    }
    if (scenarios.length === 0) {
      throw new Error("Tournament requires at least 1 scenario");
    }

    switch (mode) {
      case "round-robin":
      case "matrix":
        return this.scheduleRoundRobin(candidates, scenarios, rounds);
      case "swiss":
        return this.scheduleSwiss(candidates, scenarios, rounds);
      case "bracket":
        return this.scheduleBracket(candidates, scenarios);
      default:
        return this.scheduleRoundRobin(candidates, scenarios, rounds);
    }
  }

  private scheduleRoundRobin(
    candidates: CandidateWithTarget[],
    scenarios: ScenarioDefinition[],
    rounds: number
  ): MatchPairing[] {
    const pairings: MatchPairing[] = [];
    let matchIdx = 1;

    for (let r = 1; r <= rounds; r++) {
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          for (const scenario of scenarios) {
            // Alternate who is candidateA and candidateB across rounds
            const [candA, candB] = r % 2 === 1
              ? [candidates[i], candidates[j]]
              : [candidates[j], candidates[i]];

            pairings.push({
              matchId: `match-${r}-${matchIdx++}`,
              round: r,
              scenario,
              candidateA: candA,
              candidateB: candB,
            });
          }
        }
      }
    }

    return this.shuffle(pairings);
  }

  private scheduleSwiss(
    candidates: CandidateWithTarget[],
    scenarios: ScenarioDefinition[],
    rounds: number
  ): MatchPairing[] {
    // Sort candidates by initialRating descending
    const sorted = [...candidates].sort((a, b) => (b.initialRating ?? 1500) - (a.initialRating ?? 1500));
    const pairings: MatchPairing[] = [];
    let matchIdx = 1;

    for (let r = 1; r <= rounds; r++) {
      // Pair adjacent items: (0, 1), (2, 3)...
      for (let i = 0; i < sorted.length - 1; i += 2) {
        for (const scenario of scenarios) {
          pairings.push({
            matchId: `match-swiss-${r}-${matchIdx++}`,
            round: r,
            scenario,
            candidateA: sorted[i],
            candidateB: sorted[i + 1],
          });
        }
      }
    }

    return pairings;
  }

  private scheduleBracket(
    candidates: CandidateWithTarget[],
    scenarios: ScenarioDefinition[]
  ): MatchPairing[] {
    const sorted = [...candidates].sort((a, b) => (b.initialRating ?? 1500) - (a.initialRating ?? 1500));
    const pairings: MatchPairing[] = [];
    let matchIdx = 1;
    const n = sorted.length;

    // Seeded elimination pairings: 1 vs N, 2 vs N-1...
    for (let i = 0; i < Math.floor(n / 2); i++) {
      for (const scenario of scenarios) {
        pairings.push({
          matchId: `match-bracket-1-${matchIdx++}`,
          round: 1,
          scenario,
          candidateA: sorted[i],
          candidateB: sorted[n - 1 - i],
        });
      }
    }

    return pairings;
  }
}

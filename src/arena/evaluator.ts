import { HarnessReport, ScenarioDefinition } from "../core/types.js";
import { ScoringWeights, MatchMetrics, MatchOutcome } from "./types.js";

export interface MatchEvaluationResult {
  outcome: MatchOutcome;
  scoreA: number;
  scoreB: number;
  margin: number;
  reason: string;
}

export class MatchEvaluator {
  private defaultWeights: ScoringWeights;

  constructor(weights?: Partial<ScoringWeights>) {
    this.defaultWeights = {
      correctness: weights?.correctness ?? 0.5,
      turns: weights?.turns ?? 0.15,
      tokens: weights?.tokens ?? 0.15,
      duration: weights?.duration ?? 0.1,
      safety: weights?.safety ?? 0.1,
    };
  }

  /**
   * Compute normalized multi-dimensional metrics from a scenario execution report.
   */
  public computeMetrics(
    report: HarnessReport,
    scenario: ScenarioDefinition,
    customWeights?: Partial<ScoringWeights>
  ): MatchMetrics {
    const weights: ScoringWeights = {
      correctness: customWeights?.correctness ?? this.defaultWeights.correctness,
      turns: customWeights?.turns ?? this.defaultWeights.turns,
      tokens: customWeights?.tokens ?? this.defaultWeights.tokens,
      duration: customWeights?.duration ?? this.defaultWeights.duration,
      safety: customWeights?.safety ?? this.defaultWeights.safety,
    };

    const maxTurns = scenario.budgets?.maxTurns ?? 20;
    const maxTokens = scenario.budgets?.maxTokens ?? 50000;
    const timeoutMs = scenario.budgets?.timeoutMs ?? 60000;

    const passed = report.passed;
    const turns = report.metrics.totalTurns;
    const tokens = report.metrics.totalTokens;
    const durationMs = report.metrics.durationMs;

    // Count trajectory assertion failures or security infractions
    let violations = 0;
    if (report.assertionResults) {
      for (const res of report.assertionResults) {
        if (!res.passed) {
          const target = (res.target || "").toLowerCase();
          const desc = (res.message || "").toLowerCase();
          if (target.includes("security") || desc.includes("security") || target.includes("violation")) {
            violations++;
          }
        }
      }
    }

    // Normalized dimensions (0.0 to 1.0)
    const correctnessScore = passed ? 1.0 : 0.0;
    const turnsScore = Math.max(0, Math.min(1, (maxTurns - turns) / maxTurns));
    const tokensScore = Math.max(0, Math.min(1, (maxTokens - tokens) / maxTokens));
    const durationScore = Math.max(0, Math.min(1, (timeoutMs - durationMs) / timeoutMs));
    const safetyScore = Math.max(0, 1.0 - violations * 0.25);

    const totalWeight =
      weights.correctness +
      weights.turns +
      weights.tokens +
      weights.duration +
      weights.safety;

    const safeTotalWeight = totalWeight > 0 ? totalWeight : 1.0;

    const rawComposite =
      correctnessScore * weights.correctness +
      turnsScore * weights.turns +
      tokensScore * weights.tokens +
      durationScore * weights.duration +
      safetyScore * weights.safety;

    const compositeScore = Math.round((rawComposite / safeTotalWeight) * 1000) / 1000;

    return {
      passed,
      turns,
      tokens,
      durationMs,
      violations,
      compositeScore,
    };
  }

  /**
   * Compare two candidates' performance metrics on the same scenario.
   */
  public evaluate(
    metricsA: MatchMetrics,
    metricsB: MatchMetrics,
    options?: { drawThreshold?: number }
  ): MatchEvaluationResult {
    const drawThreshold = options?.drawThreshold ?? 0.05;

    // Determinant 1: Absolute task success difference
    if (metricsA.passed && !metricsB.passed) {
      return {
        outcome: "win_a",
        scoreA: 1.0,
        scoreB: 0.0,
        margin: Math.round((metricsA.compositeScore - metricsB.compositeScore) * 1000) / 1000,
        reason: "Candidate A successfully passed scenario verification while Candidate B failed.",
      };
    }

    if (!metricsA.passed && metricsB.passed) {
      return {
        outcome: "win_b",
        scoreA: 0.0,
        scoreB: 1.0,
        margin: Math.round((metricsB.compositeScore - metricsA.compositeScore) * 1000) / 1000,
        reason: "Candidate B successfully passed scenario verification while Candidate A failed.",
      };
    }

    // Determinant 2: Both passed or both failed -> compare composite efficiency & safety score
    const scoreDiff = metricsA.compositeScore - metricsB.compositeScore;
    const absDiff = Math.abs(scoreDiff);
    const margin = Math.round(absDiff * 1000) / 1000;

    if (absDiff <= drawThreshold) {
      return {
        outcome: "draw",
        scoreA: 0.5,
        scoreB: 0.5,
        margin,
        reason: `Performance composite margin (${margin}) within draw tolerance (${drawThreshold}).`,
      };
    }

    if (scoreDiff > 0) {
      const advantageFactors: string[] = [];
      if (metricsA.turns < metricsB.turns) advantageFactors.push(`fewer turns (${metricsA.turns} vs ${metricsB.turns})`);
      if (metricsA.tokens < metricsB.tokens) advantageFactors.push(`fewer tokens (${metricsA.tokens} vs ${metricsB.tokens})`);
      if (metricsA.durationMs < metricsB.durationMs) advantageFactors.push(`faster runtime (${metricsA.durationMs}ms vs ${metricsB.durationMs}ms)`);
      if (metricsA.violations < metricsB.violations) advantageFactors.push(`cleaner safety (${metricsA.violations} vs ${metricsB.violations} violations)`);

      const reasonDesc = advantageFactors.length > 0 ? advantageFactors.join(", ") : "higher composite efficiency";

      return {
        outcome: "win_a",
        scoreA: 1.0,
        scoreB: 0.0,
        margin,
        reason: `Candidate A outperformed Candidate B with ${reasonDesc}.`,
      };
    } else {
      const advantageFactors: string[] = [];
      if (metricsB.turns < metricsA.turns) advantageFactors.push(`fewer turns (${metricsB.turns} vs ${metricsA.turns})`);
      if (metricsB.tokens < metricsA.tokens) advantageFactors.push(`fewer tokens (${metricsB.tokens} vs ${metricsA.tokens})`);
      if (metricsB.durationMs < metricsA.durationMs) advantageFactors.push(`faster runtime (${metricsB.durationMs}ms vs ${metricsA.durationMs}ms)`);
      if (metricsB.violations < metricsA.violations) advantageFactors.push(`cleaner safety (${metricsB.violations} vs ${metricsA.violations} violations)`);

      const reasonDesc = advantageFactors.length > 0 ? advantageFactors.join(", ") : "higher composite efficiency";

      return {
        outcome: "win_b",
        scoreA: 0.0,
        scoreB: 1.0,
        margin,
        reason: `Candidate B outperformed Candidate A with ${reasonDesc}.`,
      };
    }
  }
}

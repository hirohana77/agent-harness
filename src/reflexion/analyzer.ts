import {
  FailureEpisode,
  PathologyFinding,
  ReflexionMetrics,
  ReflexionErrorClass,
  ReflexionRecoveryStrategy,
  ErrorClassStat,
} from "./types.js";

const ALL_ERROR_CLASSES: ReflexionErrorClass[] = [
  "command-failure",
  "test-regression",
  "file-not-found",
  "tool-error",
  "syntax-ast-error",
  "permission-denied",
  "hallucinated-tool",
];

const ALL_RECOVERY_STRATEGIES: ReflexionRecoveryStrategy[] = [
  "parameter-adjustment",
  "alternative-tool",
  "code-patch-rework",
  "workspace-cleanup",
  "rollback-and-restart",
  "multi-step-investigation",
];

export class ReflexionAnalyzer {
  public computeMetrics(
    episodes: FailureEpisode[],
    pathologies: PathologyFinding[] = [],
    totalTurns: number = 10
  ): ReflexionMetrics {
    const totalEpisodes = episodes.length;
    const recoveredEpisodes = episodes.filter((ep) => ep.status === "recovered").length;
    const unresolvedEpisodes = totalEpisodes - recoveredEpisodes;

    const selfHealingRate =
      totalEpisodes === 0 ? 1.0 : Number((recoveredEpisodes / totalEpisodes).toFixed(3));

    const recoveredTurnSpans = episodes
      .filter((ep) => ep.status === "recovered")
      .map((ep) => ep.turnSpan)
      .sort((a, b) => a - b);

    const meanTurnsToRecovery =
      recoveredTurnSpans.length === 0
        ? 0
        : Number(
            (
              recoveredTurnSpans.reduce((sum, val) => sum + val, 0) /
              recoveredTurnSpans.length
            ).toFixed(2)
          );

    const medianTurnsToRecovery =
      recoveredTurnSpans.length === 0
        ? 0
        : recoveredTurnSpans[Math.floor(recoveredTurnSpans.length / 2)];

    // Thrashing index calculation
    let wastedTurns = 0;
    for (const ep of episodes) {
      if (ep.status === "thrashing" || ep.status === "oscillating") {
        wastedTurns += ep.turnSpan;
      }
    }
    for (const p of pathologies) {
      wastedTurns += p.turnRange[1] - p.turnRange[0] + 1;
    }
    const safeTotalTurns = Math.max(totalTurns, 1);
    const thrashingIndex = Math.min(
      100,
      Math.max(0, Math.round((wastedTurns / safeTotalTurns) * 50))
    );

    // Cognitive resilience score: 0 - 100
    // Base 60 from SHR, 25 from swift recovery (MTTR <= 3 is max), penalties from pathologies and thrashing
    let cognitiveResilienceScore: number;
    if (totalEpisodes === 0) {
      cognitiveResilienceScore = 100;
    } else {
      const shrScore = selfHealingRate * 60;
      const speedScore = Math.max(0, (1 - Math.min(meanTurnsToRecovery, 10) / 10) * 25);
      const thrashingPenalty = (thrashingIndex / 100) * 20;

      let pathologyPenalty = 0;
      for (const p of pathologies) {
        if (p.severity === "high") pathologyPenalty += 8;
        else if (p.severity === "medium") pathologyPenalty += 4;
        else pathologyPenalty += 2;
      }

      cognitiveResilienceScore = Math.max(
        0,
        Math.min(100, Math.round(shrScore + speedScore - thrashingPenalty - pathologyPenalty))
      );
    }

    // Error class distribution
    const errorClassDistribution: Record<ReflexionErrorClass, ErrorClassStat> = {} as any;
    for (const errClass of ALL_ERROR_CLASSES) {
      const matched = episodes.filter((ep) => ep.errorClass === errClass);
      const rec = matched.filter((ep) => ep.status === "recovered").length;
      errorClassDistribution[errClass] = {
        total: matched.length,
        recovered: rec,
        recoveryRate: matched.length > 0 ? Number((rec / matched.length).toFixed(3)) : 1.0,
      };
    }

    // Strategy distribution
    const strategyDistribution: Record<ReflexionRecoveryStrategy, number> = {} as any;
    for (const strat of ALL_RECOVERY_STRATEGIES) {
      strategyDistribution[strat] = episodes.filter((ep) => ep.strategy === strat).length;
    }

    return {
      totalEpisodes,
      recoveredEpisodes,
      unresolvedEpisodes,
      selfHealingRate,
      meanTurnsToRecovery,
      medianTurnsToRecovery,
      thrashingIndex,
      cognitiveResilienceScore,
      pathologyCount: pathologies.length,
      strategyDistribution,
      errorClassDistribution,
    };
  }

  public generateRecommendations(
    metrics: ReflexionMetrics,
    pathologies: PathologyFinding[]
  ): string[] {
    const recs: string[] = [];

    if (metrics.totalEpisodes === 0) {
      recs.push("Trajectory executed cleanly without any detected failure episodes.");
      return recs;
    }

    if (metrics.selfHealingRate < 0.5) {
      recs.push(
        "Low Self-Healing Rate (<50%): Agent struggles to self-correct upon tool/command errors. Introduce automatic reflection prompts on non-zero exit codes."
      );
    }

    if (metrics.meanTurnsToRecovery > 4) {
      recs.push(
        `High MTTR (${metrics.meanTurnsToRecovery} turns): Agent takes excessive turns exploring erroneous states. Enable early diagnostic inspections (e.g. stack trace extraction).`
      );
    }

    if (metrics.thrashingIndex > 30) {
      recs.push(
        `High Thrashing Index (${metrics.thrashingIndex}/100): Implement circuit-breaker steering to halt repeated tool calls with invariant parameters.`
      );
    }

    const hasBlindRetry = pathologies.some((p) => p.type === "blind-retry");
    if (hasBlindRetry) {
      recs.push(
        "Blind Retry Pathology detected: Enforce pre-execution workspace diff checks before allowing re-running of failed test commands."
      );
    }

    const hasIgnorance = pathologies.some((p) => p.type === "error-ignorance");
    if (hasIgnorance) {
      recs.push(
        "Error Ignorance Pathology detected: Apply strict output guardrails to prevent agent from concluding tasks when tool errors remain unresolved."
      );
    }

    const hasOscillation = pathologies.some((p) => p.type === "oscillation");
    if (hasOscillation) {
      recs.push(
        "Oscillation Pathology detected: Provide historical execution summaries to break alternating action loops."
      );
    }

    if (recs.length === 0) {
      recs.push(
        "Agent demonstrated sound self-correction capabilities with satisfactory resilience scoring."
      );
    }

    return recs;
  }
}

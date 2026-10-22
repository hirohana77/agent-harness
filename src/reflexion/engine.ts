import { Trajectory } from "../core/types.js";
import {
  ReflexionReport,
  ReflexionComparisonResult,
  ReflexionAnalysisOptions,
  ReflexionPromptConfig,
  FailureEpisode,
  ComparisonVerdict,
} from "./types.js";
import { ReflexionEpisodeDetector } from "./detector.js";
import { PathologyDetector } from "./pathologies.js";
import { ReflexionAnalyzer } from "./analyzer.js";
import { ReflexionSynthesizer } from "./synthesizer.js";

export class ReflexionEngine {
  private detector: ReflexionEpisodeDetector;
  private pathologyDetector: PathologyDetector;
  private analyzer: ReflexionAnalyzer;
  private synthesizer: ReflexionSynthesizer;

  constructor(options?: ReflexionAnalysisOptions) {
    this.detector = new ReflexionEpisodeDetector(options);
    this.pathologyDetector = new PathologyDetector();
    this.analyzer = new ReflexionAnalyzer();
    this.synthesizer = new ReflexionSynthesizer();
  }

  public analyzeTrajectory(
    trajectory: Trajectory,
    options?: ReflexionAnalysisOptions
  ): ReflexionReport {
    const detector = options ? new ReflexionEpisodeDetector(options) : this.detector;
    const episodes = detector.detectEpisodes(trajectory);

    const shouldDetectPathologies = options?.detectPathologies ?? true;
    const pathologies = shouldDetectPathologies
      ? this.pathologyDetector.detectPathologies(trajectory, episodes)
      : [];

    const totalTurns = trajectory.turns ? trajectory.turns.length : 1;
    const metrics = this.analyzer.computeMetrics(episodes, pathologies, totalTurns);
    const recommendations = this.analyzer.generateRecommendations(metrics, pathologies);

    return {
      scenarioId: trajectory.scenarioId || "unknown-scenario",
      timestamp: new Date().toISOString(),
      metrics,
      episodes,
      pathologies,
      recommendations,
    };
  }

  public compare(
    baseline: ReflexionReport,
    comparative: ReflexionReport
  ): ReflexionComparisonResult {
    const deltaSelfHealingRate = Number(
      (comparative.metrics.selfHealingRate - baseline.metrics.selfHealingRate).toFixed(3)
    );
    const deltaMeanTurnsToRecovery = Number(
      (
        comparative.metrics.meanTurnsToRecovery - baseline.metrics.meanTurnsToRecovery
      ).toFixed(2)
    );
    const deltaResilienceScore =
      comparative.metrics.cognitiveResilienceScore - baseline.metrics.cognitiveResilienceScore;
    const deltaPathologyCount =
      comparative.metrics.pathologyCount - baseline.metrics.pathologyCount;

    let verdict: ComparisonVerdict;
    if (deltaResilienceScore >= 15 && deltaSelfHealingRate >= 0) {
      verdict = "significantly_improved";
    } else if (deltaResilienceScore > 3 || deltaSelfHealingRate > 0.1) {
      verdict = "moderately_improved";
    } else if (deltaResilienceScore < -5 || deltaSelfHealingRate < -0.1) {
      verdict = "degraded";
    } else {
      verdict = "neutral";
    }

    const summaryParts: string[] = [];
    if (deltaResilienceScore > 0) {
      summaryParts.push(`Resilience score improved by +${deltaResilienceScore} points`);
    } else if (deltaResilienceScore < 0) {
      summaryParts.push(`Resilience score decreased by ${deltaResilienceScore} points`);
    } else {
      summaryParts.push("Resilience score remained unchanged");
    }

    if (deltaSelfHealingRate > 0) {
      summaryParts.push(`SHR increased by +${(deltaSelfHealingRate * 100).toFixed(1)}%`);
    } else if (deltaSelfHealingRate < 0) {
      summaryParts.push(`SHR decreased by ${(deltaSelfHealingRate * 100).toFixed(1)}%`);
    }

    if (deltaPathologyCount < 0) {
      summaryParts.push(`eliminated ${Math.abs(deltaPathologyCount)} cognitive pathologies`);
    } else if (deltaPathologyCount > 0) {
      summaryParts.push(`detected ${deltaPathologyCount} additional pathologies`);
    }

    return {
      baseline: {
        scenarioId: baseline.scenarioId,
        metrics: baseline.metrics,
      },
      comparative: {
        scenarioId: comparative.scenarioId,
        metrics: comparative.metrics,
      },
      deltaSelfHealingRate,
      deltaMeanTurnsToRecovery,
      deltaResilienceScore,
      deltaPathologyCount,
      verdict,
      summary: summaryParts.join(", ") + ".",
    };
  }

  public generateReflexionPrompt(
    episode: FailureEpisode,
    config?: ReflexionPromptConfig
  ): string {
    return this.synthesizer.synthesizeReflexionPrompt(episode, config);
  }
}

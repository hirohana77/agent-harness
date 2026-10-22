import { describe, expect, it } from "vitest";
import { ReflexionAnalyzer } from "../../src/reflexion/analyzer.js";
import { FailureEpisode, PathologyFinding } from "../../src/reflexion/types.js";

describe("ReflexionAnalyzer", () => {
  const analyzer = new ReflexionAnalyzer();

  it("computes perfect resilience score for zero episodes", () => {
    const metrics = analyzer.computeMetrics([], []);
    expect(metrics.totalEpisodes).toBe(0);
    expect(metrics.recoveredEpisodes).toBe(0);
    expect(metrics.selfHealingRate).toBe(1.0);
    expect(metrics.meanTurnsToRecovery).toBe(0);
    expect(metrics.cognitiveResilienceScore).toBe(100);

    const recs = analyzer.generateRecommendations(metrics, []);
    expect(recs[0]).toContain("cleanly without any detected failure");
  });

  it("computes accurate SHR, MTTR, and score for mixed episodes", () => {
    const episodes: FailureEpisode[] = [
      {
        id: "ep-1",
        errorClass: "test-regression",
        triggerTurn: 1,
        triggerToolName: "bash",
        errorMessage: "assertion failed",
        status: "recovered",
        recoveryTurn: 2,
        turnSpan: 2,
        detectedPathologies: [],
        strategy: "code-patch-rework",
      },
      {
        id: "ep-2",
        errorClass: "command-failure",
        triggerTurn: 4,
        triggerToolName: "bash",
        errorMessage: "exit 1",
        status: "recovered",
        recoveryTurn: 6,
        turnSpan: 3,
        detectedPathologies: [],
        strategy: "parameter-adjustment",
      },
      {
        id: "ep-3",
        errorClass: "file-not-found",
        triggerTurn: 8,
        triggerToolName: "bash",
        errorMessage: "ENOENT",
        status: "abandoned",
        turnSpan: 2,
        detectedPathologies: [],
      },
    ];

    const pathologies: PathologyFinding[] = [
      {
        id: "p-1",
        type: "blind-retry",
        turnRange: [4, 5],
        severity: "medium",
        description: "Blind retry",
        evidence: "",
        suggestedRemediation: "",
      },
    ];

    const metrics = analyzer.computeMetrics(episodes, pathologies, 10);
    expect(metrics.totalEpisodes).toBe(3);
    expect(metrics.recoveredEpisodes).toBe(2);
    expect(metrics.unresolvedEpisodes).toBe(1);
    expect(metrics.selfHealingRate).toBeCloseTo(0.667, 2);
    expect(metrics.meanTurnsToRecovery).toBe(2.5); // (2 + 3) / 2
    expect(metrics.strategyDistribution["code-patch-rework"]).toBe(1);
    expect(metrics.strategyDistribution["parameter-adjustment"]).toBe(1);
    expect(metrics.errorClassDistribution["test-regression"].recoveryRate).toBe(1.0);
    expect(metrics.errorClassDistribution["file-not-found"].recoveryRate).toBe(0.0);
    expect(metrics.cognitiveResilienceScore).toBeGreaterThan(0);
    expect(metrics.cognitiveResilienceScore).toBeLessThan(100);

    const recs = analyzer.generateRecommendations(metrics, pathologies);
    expect(recs.some((r) => r.includes("Blind Retry"))).toBe(true);
  });

  it("handles high thrashing and low SHR with severe penalty recommendations", () => {
    const episodes: FailureEpisode[] = [
      {
        id: "ep-1",
        errorClass: "command-failure",
        triggerTurn: 1,
        triggerToolName: "bash",
        errorMessage: "network down",
        status: "thrashing",
        turnSpan: 8,
        detectedPathologies: ["repetitive-thrashing"],
      },
    ];

    const pathologies: PathologyFinding[] = [
      {
        id: "p-1",
        type: "repetitive-thrashing",
        turnRange: [1, 8],
        severity: "high",
        description: "Repeated thrashing",
        evidence: "",
        suggestedRemediation: "",
      },
      {
        id: "p-2",
        type: "error-ignorance",
        turnRange: [8, 8],
        severity: "high",
        description: "Ignored errors",
        evidence: "",
        suggestedRemediation: "",
      },
    ];

    const metrics = analyzer.computeMetrics(episodes, pathologies, 10);
    expect(metrics.selfHealingRate).toBe(0);
    expect(metrics.cognitiveResilienceScore).toBeLessThan(30);

    const recs = analyzer.generateRecommendations(metrics, pathologies);
    expect(recs.some((r) => r.includes("Low Self-Healing Rate"))).toBe(true);
    expect(recs.some((r) => r.includes("Error Ignorance"))).toBe(true);
  });
});

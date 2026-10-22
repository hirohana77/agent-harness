import { describe, expect, it } from "vitest";
import {
  ReflexionErrorClassSchema,
  ReflexionEpisodeStatusSchema,
  ReflexionPathologyTypeSchema,
  FailureEpisodeSchema,
  PathologyFindingSchema,
  ReflexionMetricsSchema,
  ReflexionReportSchema,
  ReflexionComparisonResultSchema,
} from "../../src/reflexion/schemas.js";

describe("Reflexion Schemas Validation", () => {
  it("validates valid and invalid error classes", () => {
    expect(ReflexionErrorClassSchema.parse("command-failure")).toBe("command-failure");
    expect(ReflexionErrorClassSchema.parse("test-regression")).toBe("test-regression");
    expect(ReflexionErrorClassSchema.parse("permission-denied")).toBe("permission-denied");
    expect(() => ReflexionErrorClassSchema.parse("random-error")).toThrow();
  });

  it("validates valid and invalid episode statuses", () => {
    expect(ReflexionEpisodeStatusSchema.parse("recovered")).toBe("recovered");
    expect(ReflexionEpisodeStatusSchema.parse("thrashing")).toBe("thrashing");
    expect(ReflexionEpisodeStatusSchema.parse("exhausted")).toBe("exhausted");
    expect(() => ReflexionEpisodeStatusSchema.parse("cancelled")).toThrow();
  });

  it("validates valid FailureEpisode object", () => {
    const validEpisode = {
      id: "ep-1-1",
      errorClass: "test-regression",
      triggerTurn: 2,
      triggerToolName: "bash",
      errorMessage: "FAIL test/app.test.js",
      exitCode: 1,
      status: "recovered",
      recoveryTurn: 4,
      turnSpan: 3,
      detectedPathologies: ["blind-retry"],
      strategy: "code-patch-rework",
      evidence: "Triggered at Turn 2",
      resolutionProof: "PASS test/app.test.js",
    };

    const parsed = FailureEpisodeSchema.parse(validEpisode);
    expect(parsed.id).toBe("ep-1-1");
    expect(parsed.turnSpan).toBe(3);
    expect(parsed.strategy).toBe("code-patch-rework");
  });

  it("validates PathologyFindingSchema", () => {
    const finding = {
      id: "pathology-blind-retry-1-3",
      type: "blind-retry",
      turnRange: [1, 3],
      severity: "medium",
      description: "Blind retry without edits",
      evidence: "Command repeated",
      suggestedRemediation: "Inspect code before retrying",
    };

    const parsed = PathologyFindingSchema.parse(finding);
    expect(parsed.type).toBe("blind-retry");
    expect(parsed.severity).toBe("medium");
  });

  it("validates ReflexionMetricsSchema bounds and types", () => {
    const metrics = {
      totalEpisodes: 2,
      recoveredEpisodes: 1,
      unresolvedEpisodes: 1,
      selfHealingRate: 0.5,
      meanTurnsToRecovery: 2.5,
      medianTurnsToRecovery: 2.5,
      thrashingIndex: 15,
      cognitiveResilienceScore: 68,
      pathologyCount: 1,
      strategyDistribution: {
        "parameter-adjustment": 0,
        "alternative-tool": 0,
        "code-patch-rework": 1,
        "workspace-cleanup": 0,
        "rollback-and-restart": 0,
        "multi-step-investigation": 0,
      },
      errorClassDistribution: {
        "command-failure": { total: 0, recovered: 0, recoveryRate: 1 },
        "test-regression": { total: 2, recovered: 1, recoveryRate: 0.5 },
        "file-not-found": { total: 0, recovered: 0, recoveryRate: 1 },
        "tool-error": { total: 0, recovered: 0, recoveryRate: 1 },
        "syntax-ast-error": { total: 0, recovered: 0, recoveryRate: 1 },
        "permission-denied": { total: 0, recovered: 0, recoveryRate: 1 },
        "hallucinated-tool": { total: 0, recovered: 0, recoveryRate: 1 },
      },
    };

    const parsed = ReflexionMetricsSchema.parse(metrics);
    expect(parsed.selfHealingRate).toBe(0.5);
    expect(parsed.cognitiveResilienceScore).toBe(68);
  });

  it("validates ReflexionComparisonResultSchema", () => {
    const sampleMetrics = {
      totalEpisodes: 2,
      recoveredEpisodes: 2,
      unresolvedEpisodes: 0,
      selfHealingRate: 1.0,
      meanTurnsToRecovery: 1.5,
      medianTurnsToRecovery: 1.5,
      thrashingIndex: 0,
      cognitiveResilienceScore: 92,
      pathologyCount: 0,
      strategyDistribution: {
        "parameter-adjustment": 0,
        "alternative-tool": 0,
        "code-patch-rework": 2,
        "workspace-cleanup": 0,
        "rollback-and-restart": 0,
        "multi-step-investigation": 0,
      },
      errorClassDistribution: {
        "command-failure": { total: 0, recovered: 0, recoveryRate: 1 },
        "test-regression": { total: 2, recovered: 2, recoveryRate: 1 },
        "file-not-found": { total: 0, recovered: 0, recoveryRate: 1 },
        "tool-error": { total: 0, recovered: 0, recoveryRate: 1 },
        "syntax-ast-error": { total: 0, recovered: 0, recoveryRate: 1 },
        "permission-denied": { total: 0, recovered: 0, recoveryRate: 1 },
        "hallucinated-tool": { total: 0, recovered: 0, recoveryRate: 1 },
      },
    };

    const comp = {
      baseline: { scenarioId: "task-1", metrics: sampleMetrics },
      comparative: { scenarioId: "task-1", metrics: sampleMetrics },
      deltaSelfHealingRate: 0,
      deltaMeanTurnsToRecovery: 0,
      deltaResilienceScore: 0,
      deltaPathologyCount: 0,
      verdict: "neutral",
      summary: "Identical performance",
    };

    const parsed = ReflexionComparisonResultSchema.parse(comp);
    expect(parsed.verdict).toBe("neutral");
  });
});

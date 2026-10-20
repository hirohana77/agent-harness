import { describe, it, expect } from "vitest";
import { MatchEvaluator } from "../../src/arena/evaluator.js";
import { HarnessReport, ScenarioDefinition } from "../../src/core/types.js";

describe("MatchEvaluator", () => {
  const mockScenario: ScenarioDefinition = {
    id: "test-scenario",
    name: "Test Scenario",
    workspace: { cleanup: true, gitInit: false },
    task: { instruction: "Write code" },
    budgets: {
      maxTurns: 10,
      maxTokens: 10000,
      timeoutMs: 30000,
    },
    assertions: {},
  };

  const createReport = (
    passed: boolean,
    turns: number,
    tokens: number,
    durationMs: number,
    violations = 0
  ): HarnessReport => ({
    scenarioId: "test-scenario",
    scenarioName: "Test Scenario",
    timestamp: new Date().toISOString(),
    passed,
    metrics: {
      durationMs,
      totalTurns: turns,
      totalAssertions: 2,
      passedAssertions: passed ? 2 : 1,
      failedAssertions: passed ? 0 : 1,
      totalTokens: tokens,
      costUsd: 0.01,
    },
    assertionResults: violations > 0
      ? [
          {
            type: "trajectory",
            target: "security_policy",
            passed: false,
            message: "Security violation detected",
          },
        ]
      : [
          {
            type: "file",
            target: "test.txt",
            passed,
            message: passed ? "File verified" : "File missing",
          },
        ],
    trajectorySummary: {
      totalTurns: turns,
      totalToolCalls: turns,
      toolsUsed: ["bash"],
      errorCount: passed ? 0 : 1,
    },
  });

  it("should compute normalized metrics correctly", () => {
    const evaluator = new MatchEvaluator();
    const report = createReport(true, 5, 5000, 15000, 0);
    const metrics = evaluator.computeMetrics(report, mockScenario);

    expect(metrics.passed).toBe(true);
    expect(metrics.turns).toBe(5);
    expect(metrics.tokens).toBe(5000);
    expect(metrics.durationMs).toBe(15000);
    expect(metrics.violations).toBe(0);
    expect(metrics.compositeScore).toBeGreaterThan(0.5);
  });

  it("should declare candidate A winner when A passes and B fails", () => {
    const evaluator = new MatchEvaluator();
    const reportA = createReport(true, 5, 5000, 10000);
    const reportB = createReport(false, 3, 2000, 5000);

    const metricsA = evaluator.computeMetrics(reportA, mockScenario);
    const metricsB = evaluator.computeMetrics(reportB, mockScenario);

    const result = evaluator.evaluate(metricsA, metricsB);
    expect(result.outcome).toBe("win_a");
    expect(result.scoreA).toBe(1.0);
    expect(result.scoreB).toBe(0.0);
    expect(result.reason).toContain("Candidate A successfully passed");
  });

  it("should declare candidate B winner when B passes and A fails", () => {
    const evaluator = new MatchEvaluator();
    const reportA = createReport(false, 5, 5000, 10000);
    const reportB = createReport(true, 4, 3000, 8000);

    const metricsA = evaluator.computeMetrics(reportA, mockScenario);
    const metricsB = evaluator.computeMetrics(reportB, mockScenario);

    const result = evaluator.evaluate(metricsA, metricsB);
    expect(result.outcome).toBe("win_b");
    expect(result.scoreA).toBe(0.0);
    expect(result.scoreB).toBe(1.0);
    expect(result.reason).toContain("Candidate B successfully passed");
  });

  it("should resolve tie-breaker on efficiency when both pass", () => {
    const evaluator = new MatchEvaluator();
    // A uses fewer turns and fewer tokens
    const reportA = createReport(true, 2, 1000, 2000);
    const reportB = createReport(true, 9, 9000, 25000);

    const metricsA = evaluator.computeMetrics(reportA, mockScenario);
    const metricsB = evaluator.computeMetrics(reportB, mockScenario);

    const result = evaluator.evaluate(metricsA, metricsB);
    expect(result.outcome).toBe("win_a");
    expect(result.scoreA).toBe(1.0);
    expect(result.scoreB).toBe(0.0);
    expect(result.reason).toContain("fewer turns");
  });

  it("should declare draw when scores are within drawThreshold", () => {
    const evaluator = new MatchEvaluator();
    const reportA = createReport(true, 4, 4000, 10000);
    const reportB = createReport(true, 4, 4100, 10100);

    const metricsA = evaluator.computeMetrics(reportA, mockScenario);
    const metricsB = evaluator.computeMetrics(reportB, mockScenario);

    const result = evaluator.evaluate(metricsA, metricsB, { drawThreshold: 0.05 });
    expect(result.outcome).toBe("draw");
    expect(result.scoreA).toBe(0.5);
    expect(result.scoreB).toBe(0.5);
    expect(result.reason).toContain("within draw tolerance");
  });

  it("should penalize security violations in composite scoring", () => {
    const evaluator = new MatchEvaluator();
    const reportA = createReport(true, 4, 4000, 10000, 0);
    const reportB = createReport(true, 4, 4000, 10000, 2);

    const metricsA = evaluator.computeMetrics(reportA, mockScenario);
    const metricsB = evaluator.computeMetrics(reportB, mockScenario);

    expect(metricsA.compositeScore).toBeGreaterThan(metricsB.compositeScore);
    const result = evaluator.evaluate(metricsA, metricsB);
    expect(result.outcome).toBe("win_a");
  });
});

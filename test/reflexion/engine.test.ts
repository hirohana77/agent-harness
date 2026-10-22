import { describe, expect, it } from "vitest";
import { ReflexionEngine } from "../../src/reflexion/engine.js";
import { Trajectory } from "../../src/core/types.js";

describe("ReflexionEngine", () => {
  const engine = new ReflexionEngine();

  const resilientTrajectory: Trajectory = {
    scenarioId: "resilient-scenario",
    startedAt: new Date().toISOString(),
    durationMs: 4000,
    status: "completed",
    summary: { totalTurns: 3, totalToolCalls: 3, totalTokens: 1000, costUsd: 0.01, completed: true },
    turns: [
      {
        turnNumber: 1,
        prompt: "Run tests",
        toolCalls: [
          { callId: "c1", toolName: "bash", arguments: { command: "npm test" }, result: { success: false, exitCode: 1, output: "FAIL auth.test.ts" } },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Fix token verification",
        toolCalls: [
          { callId: "c2", toolName: "file_write", arguments: { path: "src/auth.ts", content: "verifyToken = true" }, result: { success: true } },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Re-run tests",
        toolCalls: [
          { callId: "c3", toolName: "bash", arguments: { command: "npm test" }, result: { success: true, exitCode: 0, output: "PASS auth.test.ts" } },
        ],
      },
    ],
  };

  const fragileTrajectory: Trajectory = {
    scenarioId: "fragile-scenario",
    startedAt: new Date().toISOString(),
    durationMs: 4000,
    status: "error",
    summary: { totalTurns: 4, totalToolCalls: 4, totalTokens: 1000, costUsd: 0.01, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Run tests",
        toolCalls: [
          { callId: "c1", toolName: "bash", arguments: { command: "npm test" }, result: { success: false, exitCode: 1, output: "FAIL auth.test.ts" } },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Blind retry",
        toolCalls: [
          { callId: "c2", toolName: "bash", arguments: { command: "npm test" }, result: { success: false, exitCode: 1, output: "FAIL auth.test.ts" } },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Blind retry 2",
        toolCalls: [
          { callId: "c3", toolName: "bash", arguments: { command: "npm test" }, result: { success: false, exitCode: 1, output: "FAIL auth.test.ts" } },
        ],
      },
      {
        turnNumber: 4,
        prompt: "Give up",
        assistantMessage: "All tests passed successfully!",
        toolCalls: [],
      },
    ],
  };

  it("analyzes resilient trajectory with high SHR and clean resolution", () => {
    const report = engine.analyzeTrajectory(resilientTrajectory);
    expect(report.scenarioId).toBe("resilient-scenario");
    expect(report.metrics.totalEpisodes).toBe(1);
    expect(report.metrics.recoveredEpisodes).toBe(1);
    expect(report.metrics.selfHealingRate).toBe(1.0);
    expect(report.metrics.meanTurnsToRecovery).toBe(3);
    expect(report.metrics.cognitiveResilienceScore).toBeGreaterThan(70);
    expect(report.episodes[0].strategy).toBe("code-patch-rework");
  });

  it("analyzes fragile trajectory with low SHR and multiple pathologies", () => {
    const report = engine.analyzeTrajectory(fragileTrajectory);
    expect(report.scenarioId).toBe("fragile-scenario");
    expect(report.metrics.selfHealingRate).toBe(0.0);
    expect(report.metrics.cognitiveResilienceScore).toBeLessThan(40);
    expect(report.pathologies.length).toBeGreaterThan(0);
    expect(report.pathologies.some((p) => p.type === "blind-retry" || p.type === "repetitive-thrashing")).toBe(true);
  });

  it("compares baseline vs comparative trajectories showing significant improvement", () => {
    const baselineReport = engine.analyzeTrajectory(fragileTrajectory);
    const improvedReport = engine.analyzeTrajectory(resilientTrajectory);

    const comparison = engine.compare(baselineReport, improvedReport);
    expect(comparison.deltaSelfHealingRate).toBe(1.0);
    expect(comparison.deltaResilienceScore).toBeGreaterThan(20);
    expect(comparison.verdict).toBe("significantly_improved");
    expect(comparison.summary).toContain("Resilience score improved");
  });

  it("synthesizes verbal reflexion prompt accurately", () => {
    const report = engine.analyzeTrajectory(fragileTrajectory);
    const episode = report.episodes[0];
    const prompt = engine.generateReflexionPrompt(episode);

    expect(prompt).toContain("[REFLEXION SELF-CORRECTION PROMPT]");
    expect(prompt).toContain("Trigger Turn: Turn 1");
    expect(prompt).toContain("Tool Invoked: bash");
    expect(prompt).toContain("Cognitive Reflection Directives:");
  });
});

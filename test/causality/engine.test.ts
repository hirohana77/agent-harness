import { describe, expect, it } from "vitest";
import { CausalAttributionEngine } from "../../src/causality/engine.js";
import { Trajectory } from "../../src/core/types.js";

describe("CausalAttributionEngine", () => {
  const sampleTrajectory: Trajectory = {
    scenarioId: "engine-test-scenario",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: { totalTurns: 4, totalToolCalls: 4, totalTokens: 1800, costUsd: 0.03, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Init server file",
        toolCalls: [
          {
            callId: "t1",
            toolName: "file_write",
            arguments: { path: "server.js", content: "const http = require('http');" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Unrelated noise command",
        toolCalls: [
          {
            callId: "t2",
            toolName: "bash",
            arguments: { command: "uptime" },
            result: { success: true, exitCode: 0, stdout: "up 5 days" },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Corrupt server file",
        toolCalls: [
          {
            callId: "t3",
            toolName: "patch_file",
            arguments: { path: "server.js", content: "require('non_existent_module')" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 4,
        prompt: "Test server",
        toolCalls: [
          {
            callId: "t4",
            toolName: "bash",
            arguments: { command: "node server.js" },
            result: { success: false, exitCode: 1, error: "Cannot find module 'non_existent_module'" },
          },
        ],
      },
    ],
  };

  it("performs comprehensive causal analysis and outputs recommendations", () => {
    const engine = new CausalAttributionEngine();
    const report = engine.analyze(sampleTrajectory);

    expect(report.scenarioId).toBe("engine-test-scenario");
    expect(report.graphSummary.nodeCount).toBeGreaterThan(5);
    expect(report.graphSummary.edgeCount).toBeGreaterThan(5);
    expect(report.criticalPath).toBeDefined();
    expect(report.topAttributions.length).toBeGreaterThan(0);
    expect(report.failureSlice).toBeDefined();
    expect(report.recommendations.length).toBeGreaterThan(0);

    // Verify recommendations highlight primary root cause
    const hasRootCauseRec = report.recommendations.some((r) => r.includes("root cause"));
    expect(hasRootCauseRec).toBe(true);
  });

  it("filters attributions based on minAttributionScore", () => {
    const engine = new CausalAttributionEngine();
    const report = engine.analyze(sampleTrajectory, { minAttributionScore: 0.5 });

    for (const attr of report.topAttributions) {
      expect(attr.responsibilityScore).toBeGreaterThanOrEqual(0.5);
    }
  });
});

import { describe, expect, it } from "vitest";
import { CausalGraphBuilder } from "../../src/causality/graph-builder.js";
import { TrajectorySlicer } from "../../src/causality/slicer.js";
import { AttributionEngine } from "../../src/causality/attribution.js";
import { Trajectory } from "../../src/core/types.js";

describe("AttributionEngine", () => {
  const sampleTrajectory: Trajectory = {
    scenarioId: "attribution-test",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: { totalTurns: 3, totalToolCalls: 3, totalTokens: 1200, costUsd: 0.02, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Write app",
        toolCalls: [
          {
            callId: "call-1",
            toolName: "file_write",
            arguments: { path: "app.js", content: "console.log('ok');" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Introduce bug",
        toolCalls: [
          {
            callId: "call-2",
            toolName: "patch_file",
            arguments: { path: "app.js", content: "throw new Error('Fatal boom');" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Run app",
        toolCalls: [
          {
            callId: "call-3",
            toolName: "bash",
            arguments: { command: "node app.js" },
            result: { success: false, exitCode: 1, error: "Error: Fatal boom" },
          },
        ],
      },
    ],
  };

  it("computes responsibility scores and ranks top causal contributors", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(sampleTrajectory);

    const slicer = new TrajectorySlicer();
    const targetNodeId = "node_tool_call-3";
    const slice = slicer.computeBackwardSlice(graph, targetNodeId);

    const attribution = new AttributionEngine();
    const scores = attribution.computeAttribution(graph, slice, targetNodeId);

    expect(scores.length).toBeGreaterThan(0);
    // Highest responsibility should be directly connected or high-impact modifying tool
    const top = scores[0];
    expect(top.responsibilityScore).toBeGreaterThan(0.3);
    expect(top.shapleyWeight).toBeGreaterThan(0);

    // Verify ordering is descending
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i].responsibilityScore).toBeGreaterThanOrEqual(scores[i + 1].responsibilityScore);
    }
  });

  it("evaluates critical path and calculates efficiency ratio", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(sampleTrajectory);
    const slicer = new TrajectorySlicer();
    const slice = slicer.computeBackwardSlice(graph, "node_tool_call-3");

    const attribution = new AttributionEngine();
    const criticalPath = attribution.evaluateCriticalPath(graph, slice.criticalPathNodeIds);

    expect(criticalPath.totalTurns).toBe(3);
    expect(criticalPath.criticalTurns).toBeGreaterThanOrEqual(1);
    expect(criticalPath.efficiencyRatio).toBeGreaterThan(0);
    expect(criticalPath.efficiencyRatio).toBeLessThanOrEqual(1.0);
  });

  it("predicts intervention blast radius and outcome change", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(sampleTrajectory);
    const attribution = new AttributionEngine();

    const impact = attribution.predictInterventionImpact(graph, "node_tool_call-3");

    expect(impact.targetNodeId).toBe("node_tool_call-3");
    expect(impact.predictedOutcomeChange).toBe("rescued");
    expect(impact.guidance).toContain("rescu");
  });
});

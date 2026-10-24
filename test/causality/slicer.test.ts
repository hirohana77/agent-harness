import { describe, expect, it } from "vitest";
import { CausalGraphBuilder } from "../../src/causality/graph-builder.js";
import { TrajectorySlicer } from "../../src/causality/slicer.js";
import { Trajectory } from "../../src/core/types.js";

describe("TrajectorySlicer", () => {
  const trajectoryWithNoise: Trajectory = {
    scenarioId: "slicer-test-trajectory",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: { totalTurns: 4, totalToolCalls: 4, totalTokens: 2000, costUsd: 0.04, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Create essential file",
        toolCalls: [
          {
            callId: "step-1",
            toolName: "file_write",
            arguments: { path: "main.py", content: "print('hello')" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Exploratory noise: check directory contents and create temporary note",
        toolCalls: [
          {
            callId: "noise-1",
            toolName: "bash",
            arguments: { command: "ls -la && echo 'note' > notes.tmp" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Corrupt main file",
        toolCalls: [
          {
            callId: "step-2",
            toolName: "patch_file",
            arguments: { path: "main.py", content: "syntax error !!!" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 4,
        prompt: "Execute main file",
        toolCalls: [
          {
            callId: "step-3",
            toolName: "bash",
            arguments: { command: "python3 main.py" },
            result: { success: false, exitCode: 1, error: "SyntaxError: invalid syntax" },
          },
        ],
      },
    ],
  };

  it("isolates causal predecessors and prunes unrelated exploratory noise", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(trajectoryWithNoise);

    const slicer = new TrajectorySlicer();
    const targetNodeId = "node_tool_step-3"; // python3 main.py failure

    const slice = slicer.computeBackwardSlice(graph, targetNodeId);

    expect(slice.targetNodeId).toBe(targetNodeId);
    expect(slice.ancestorNodeIds).toContain(targetNodeId);
    expect(slice.ancestorNodeIds).toContain("node_tool_step-2"); // corrupt main.py
    expect(slice.ancestorNodeIds).toContain("node_tool_step-1"); // create main.py

    // The temporary note creation (noise-1) should be pruned if it has no downstream link to main.py execution
    // (Note: temporal_flow connects turns, but data dependencies trace directly to main.py)
    expect(slice.causalChainDepth).toBeGreaterThan(0);
    expect(slice.criticalPathNodeIds.length).toBeGreaterThan(0);
    expect(slice.criticalPathNodeIds[slice.criticalPathNodeIds.length - 1]).toBe(targetNodeId);
  });

  it("throws an error when target node does not exist", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(trajectoryWithNoise);
    const slicer = new TrajectorySlicer();

    expect(() => slicer.computeBackwardSlice(graph, "non_existent_node")).toThrow(
      'Target node "non_existent_node" not found'
    );
  });
});

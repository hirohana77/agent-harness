import { describe, expect, it } from "vitest";
import { CausalGraphBuilder } from "../../src/causality/graph-builder.js";
import { Trajectory } from "../../src/core/types.js";

describe("CausalGraphBuilder", () => {
  const sampleTrajectory: Trajectory = {
    scenarioId: "causal-builder-test",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: { totalTurns: 3, totalToolCalls: 3, totalTokens: 1500, costUsd: 0.03, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Create initial config and source",
        toolCalls: [
          {
            callId: "call-1",
            toolName: "file_write",
            arguments: { path: "src/config.json", content: '{"port": 8080}' },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Edit source code",
        toolCalls: [
          {
            callId: "call-2",
            toolName: "patch_file",
            arguments: { path: "src/config.json", content: '{"port": 9000, "broken": }' },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Run application",
        toolCalls: [
          {
            callId: "call-3",
            toolName: "bash",
            arguments: { command: "node src/config.json" },
            result: { success: false, exitCode: 1, error: "SyntaxError: Unexpected token" },
          },
        ],
      },
    ],
  };

  it("builds a causal DAG with turns, tool calls, and artifact dependencies", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(sampleTrajectory);

    expect(graph.scenarioId).toBe("causal-builder-test");
    expect(graph.nodes["node_init"]).toBeDefined();
    expect(graph.nodes["node_turn_1"]).toBeDefined();
    expect(graph.nodes["node_turn_2"]).toBeDefined();
    expect(graph.nodes["node_turn_3"]).toBeDefined();

    // Verify artifact nodes exist
    const artifactNodes = Object.values(graph.nodes).filter((n) => n.type === "artifact_state");
    expect(artifactNodes.length).toBeGreaterThanOrEqual(2); // v1 and v2

    // Verify tool invocation nodes
    const toolNodes = Object.values(graph.nodes).filter((n) => n.type === "tool_invocation");
    expect(toolNodes.length).toBe(3);

    // Call 3 should be marked as failure
    const call3Node = graph.nodes["node_tool_call-3"];
    expect(call3Node).toBeDefined();
    expect(call3Node.status).toBe("failure");

    // Edges should include data_write, data_read, and temporal_flow
    const edgeTypes = new Set(graph.edges.map((e) => e.type));
    expect(edgeTypes.has("temporal_flow")).toBe(true);
    expect(edgeTypes.has("data_write")).toBe(true);
    expect(edgeTypes.has("data_read")).toBe(true);
  });

  it("parses shell command side-effects (env, redirects, reads)", () => {
    const builder = new CausalGraphBuilder();
    const shellTrajectory: Trajectory = {
      scenarioId: "shell-side-effects",
      startedAt: "2026-10-24T03:00:00.000Z",
      status: "completed",
      summary: { totalTurns: 1, totalToolCalls: 2, totalTokens: 500, costUsd: 0.01, completed: true },
      turns: [
        {
          turnNumber: 1,
          prompt: "Export env and touch file",
          toolCalls: [
            {
              callId: "shell-1",
              toolName: "bash",
              arguments: { command: "export API_KEY=secret_123 && echo 'hello' > output.log" },
              result: { success: true, exitCode: 0 },
            },
            {
              callId: "shell-2",
              toolName: "bash",
              arguments: { command: "cat output.log" },
              result: { success: true, exitCode: 0, stdout: "hello" },
            },
          ],
        },
      ],
    };

    const graph = builder.build(shellTrajectory);

    // Should detect environment state
    const envNodes = Object.values(graph.nodes).filter((n) => n.type === "environment_state");
    expect(envNodes.length).toBe(1);
    expect(envNodes[0].label).toContain("API_KEY");

    // Should detect output.log artifact
    const artifactNodes = Object.values(graph.nodes).filter((n) => n.type === "artifact_state");
    expect(artifactNodes.some((a) => a.artifactPath === "output.log")).toBe(true);

    // Should detect cat reading output.log
    const readEdges = graph.edges.filter((e) => e.type === "data_read");
    expect(readEdges.length).toBeGreaterThan(0);
  });

  it("links assertions correctly when report is provided", () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build(sampleTrajectory, {
      report: {
        scenarioId: "causal-builder-test",
        scenarioName: "Sample",
        timestamp: new Date().toISOString(),
        passed: false,
        assertionResults: [
          {
            type: "file",
            target: "src/config.json",
            passed: false,
            message: "Config must be valid json",
          },
        ],
        trajectorySummary: sampleTrajectory.summary,
        metrics: {
          durationMs: 100,
          totalTurns: 3,
          totalAssertions: 1,
          passedAssertions: 0,
          failedAssertions: 1,
          totalTokens: 1500,
          costUsd: 0.03,
        },
      },
    });

    const assertNodes = Object.values(graph.nodes).filter((n) => n.type === "assertion_outcome");
    expect(assertNodes.length).toBe(1);
    expect(assertNodes[0].status).toBe("failure");

    // Assertion should be linked to src/config.json artifact
    const assertTargetEdges = graph.edges.filter((e) => e.type === "assertion_target");
    expect(assertTargetEdges.length).toBe(1);
  });
});

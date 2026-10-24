import { describe, expect, it } from "vitest";
import {
  CausalNodeSchema,
  CausalEdgeSchema,
  CausalGraphSchema,
  CausalSliceSchema,
  AttributionScoreSchema,
  CriticalPathResultSchema,
  CausalInterventionImpactSchema,
  CausalReportSchema,
} from "../../src/causality/schemas.js";

describe("Causality Schemas", () => {
  it("validates CausalNodeSchema correctly", () => {
    const validNode = {
      id: "node_1",
      type: "tool_invocation",
      label: "bash(command=\"npm test\")",
      turnNumber: 2,
      toolCallId: "call_1",
      toolName: "bash",
      status: "failure",
    };
    expect(CausalNodeSchema.safeParse(validNode).success).toBe(true);

    const invalidTypeNode = {
      ...validNode,
      type: "invalid_type",
    };
    expect(CausalNodeSchema.safeParse(invalidTypeNode).success).toBe(false);
  });

  it("validates CausalEdgeSchema correctly", () => {
    const validEdge = {
      id: "edge_1",
      source: "node_1",
      target: "node_2",
      type: "data_write",
      label: "creates file",
      weight: 1.5,
    };
    expect(CausalEdgeSchema.safeParse(validEdge).success).toBe(true);
  });

  it("validates CausalGraphSchema correctly", () => {
    const graph = {
      scenarioId: "test-scenario",
      nodes: {
        node_1: {
          id: "node_1",
          type: "initial_state",
          label: "Initial State",
          status: "neutral",
        },
      },
      edges: [],
      metadata: {
        totalTurns: 1,
        totalNodes: 1,
        totalEdges: 0,
        generatedAt: new Date().toISOString(),
      },
    };
    expect(CausalGraphSchema.safeParse(graph).success).toBe(true);
  });

  it("validates CausalSliceSchema correctly", () => {
    const slice = {
      targetNodeId: "node_err",
      targetLabel: "SyntaxError in calc.js",
      ancestorNodeIds: ["node_init", "node_turn_1", "node_err"],
      prunedNodeIds: ["node_turn_2_unrelated"],
      criticalPathNodeIds: ["node_init", "node_turn_1", "node_err"],
      causalChainDepth: 2,
      sliceCompressionRatio: 0.25,
    };
    expect(CausalSliceSchema.safeParse(slice).success).toBe(true);
  });

  it("validates AttributionScoreSchema and CriticalPathResultSchema", () => {
    const attr = {
      nodeId: "node_tool_1",
      label: "patch_file",
      turnNumber: 1,
      toolName: "patch_file",
      responsibilityScore: 0.85,
      shapleyWeight: 0.42,
      directImpact: true,
      depthFromTarget: 1,
      summary: "Direct causal write into faulty config file",
    };
    expect(AttributionScoreSchema.safeParse(attr).success).toBe(true);

    const crit = {
      nodeIds: ["node_init", "node_tool_1"],
      totalTurns: 4,
      criticalTurns: 2,
      efficiencyRatio: 0.5,
      bottleneckNodeId: "node_tool_1",
    };
    expect(CriticalPathResultSchema.safeParse(crit).success).toBe(true);
  });

  it("validates CausalReportSchema", () => {
    const report = {
      scenarioId: "scenario-123",
      timestamp: new Date().toISOString(),
      graphSummary: {
        nodeCount: 10,
        edgeCount: 12,
        rootCausesCount: 1,
        noiseNodesCount: 3,
      },
      criticalPath: {
        nodeIds: ["node_1", "node_2"],
        totalTurns: 3,
        criticalTurns: 2,
        efficiencyRatio: 0.67,
      },
      topAttributions: [
        {
          nodeId: "node_1",
          label: "bash(rm)",
          responsibilityScore: 0.9,
          shapleyWeight: 0.5,
          directImpact: true,
          depthFromTarget: 1,
          summary: "Removed critical dependency",
        },
      ],
      recommendations: ["Check prompt guidance at turn 1"],
    };
    expect(CausalReportSchema.safeParse(report).success).toBe(true);
  });
});

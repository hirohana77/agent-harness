import { describe, expect, it } from "vitest";
import { renderCausalReport } from "../../src/causality/reporters/index.js";
import { CausalReport } from "../../src/causality/types.js";

describe("Causal Reporters", () => {
  const sampleReport: CausalReport = {
    scenarioId: "reporter-test-scenario",
    timestamp: "2026-10-24T03:00:00.000Z",
    graphSummary: {
      nodeCount: 8,
      edgeCount: 10,
      rootCausesCount: 1,
      noiseNodesCount: 2,
    },
    criticalPath: {
      nodeIds: ["node_init", "node_tool_1", "node_tool_2"],
      totalTurns: 3,
      criticalTurns: 2,
      efficiencyRatio: 0.67,
      bottleneckNodeId: "node_tool_1",
    },
    topAttributions: [
      {
        nodeId: "node_tool_1",
        label: "patch_file(path=\"config.json\")",
        turnNumber: 2,
        toolName: "patch_file",
        responsibilityScore: 0.82,
        shapleyWeight: 0.55,
        directImpact: true,
        depthFromTarget: 1,
        summary: "Direct modification to broken config",
      },
    ],
    failureSlice: {
      targetNodeId: "node_tool_2",
      targetLabel: "bash(command=\"node app.js\")",
      ancestorNodeIds: ["node_init", "node_tool_1", "node_tool_2"],
      prunedNodeIds: ["node_noise_1", "node_noise_2"],
      criticalPathNodeIds: ["node_init", "node_tool_1", "node_tool_2"],
      causalChainDepth: 2,
      sliceCompressionRatio: 0.25,
    },
    interventionImpact: {
      targetNodeId: "node_tool_1",
      targetLabel: "patch_file(path=\"config.json\")",
      invalidatedDownstreamNodeIds: ["node_tool_2"],
      affectedArtifactPaths: ["config.json"],
      predictedOutcomeChange: "rescued",
      guidance: "Intervention at Turn 2 will rescue application startup",
    },
    recommendations: ["Check syntax at Turn 2 before committing"],
  };

  it("renders terminal report with ansi formatting and badges", () => {
    const rendered = renderCausalReport(sampleReport, "terminal");
    expect(rendered).toContain("CAUSAL DAG & ROOT-CAUSE ATTRIBUTION REPORT");
    expect(rendered).toContain("reporter-test-scenario");
    expect(rendered).toContain("Critical Path & Trajectory Efficiency");
    expect(rendered).toContain("Root-Cause Responsibility Ranking");
    expect(rendered).toContain("82%");
  });

  it("renders GitHub markdown report with structured tables", () => {
    const rendered = renderCausalReport(sampleReport, "markdown");
    expect(rendered).toContain("# Causal DAG & Root-Cause Attribution Report");
    expect(rendered).toContain("| Rank | Turn | Action / Label | Responsibility |");
    expect(rendered).toContain("## 1. Critical Path & Trajectory Efficiency");
    expect(rendered).toContain("## 4. Counterfactual Intervention Guidance");
    expect(rendered).toContain("config.json");
  });

  it("renders Mermaid flowchart diagram", () => {
    const rendered = renderCausalReport(sampleReport, "mermaid");
    expect(rendered).toContain("```mermaid");
    expect(rendered).toContain("graph TD");
    expect(rendered).toContain("```");
  });

  it("renders Graphviz DOT graph format", () => {
    const rendered = renderCausalReport(sampleReport, "dot");
    expect(rendered).toContain("digraph CausalGraph_");
    expect(rendered).toContain('rankdir="TB";');
    expect(rendered).toContain("}");
  });

  it("renders JSON report string", () => {
    const rendered = renderCausalReport(sampleReport, "json");
    const parsed = JSON.parse(rendered);
    expect(parsed.scenarioId).toBe("reporter-test-scenario");
    expect(parsed.topAttributions.length).toBe(1);
  });
});

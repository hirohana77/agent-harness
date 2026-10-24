import { Trajectory, ScenarioDefinition, HarnessReport } from "../core/types.js";
import {
  CausalGraph,
  CausalSlice,
  AttributionScore,
  CriticalPathResult,
  CausalInterventionImpact,
  CausalReport,
} from "./types.js";
import { CausalGraphBuilder, GraphBuilderOptions } from "./graph-builder.js";
import { TrajectorySlicer } from "./slicer.js";
import { AttributionEngine } from "./attribution.js";

export interface CausalAnalysisOptions extends GraphBuilderOptions {
  targetNodeId?: string;
  minAttributionScore?: number;
}

export class CausalAttributionEngine {
  private builder: CausalGraphBuilder;
  private slicer: TrajectorySlicer;
  private attribution: AttributionEngine;

  constructor() {
    this.builder = new CausalGraphBuilder();
    this.slicer = new TrajectorySlicer();
    this.attribution = new AttributionEngine();
  }

  public buildGraph(trajectory: Trajectory, options?: GraphBuilderOptions): CausalGraph {
    return this.builder.build(trajectory, options);
  }

  public slice(graph: CausalGraph, targetNodeId: string): CausalSlice {
    return this.slicer.computeBackwardSlice(graph, targetNodeId);
  }

  public attribute(
    graph: CausalGraph,
    targetNodeId: string,
    slice?: CausalSlice
  ): AttributionScore[] {
    const s = slice || this.slicer.computeBackwardSlice(graph, targetNodeId);
    return this.attribution.computeAttribution(graph, s, targetNodeId);
  }

  public evaluateCriticalPath(
    graph: CausalGraph,
    criticalPathNodeIds: string[]
  ): CriticalPathResult {
    return this.attribution.evaluateCriticalPath(graph, criticalPathNodeIds);
  }

  public predictIntervention(
    graph: CausalGraph,
    targetNodeId: string
  ): CausalInterventionImpact {
    return this.attribution.predictInterventionImpact(graph, targetNodeId);
  }

  public analyze(trajectory: Trajectory, options?: CausalAnalysisOptions): CausalReport {
    const graph = this.builder.build(trajectory, options);

    // Identify target node if not explicitly passed
    let targetNodeId = options?.targetNodeId;
    if (!targetNodeId) {
      // 1. Look for first failed assertion node
      const failedAssert = Object.values(graph.nodes).find(
        (n) => n.type === "assertion_outcome" && n.status === "failure"
      );
      if (failedAssert) {
        targetNodeId = failedAssert.id;
      } else {
        // 2. Look for any failed tool invocation
        const failedTool = Object.values(graph.nodes).find(
          (n) => n.type === "tool_invocation" && n.status === "failure"
        );
        if (failedTool) {
          targetNodeId = failedTool.id;
        } else {
          // 3. Fallback: last node in DAG
          const allNodes = Object.values(graph.nodes);
          targetNodeId = allNodes[allNodes.length - 1]?.id || "node_init";
        }
      }
    }

    const failureSlice = this.slicer.computeBackwardSlice(graph, targetNodeId);
    const allAttributions = this.attribution.computeAttribution(graph, failureSlice, targetNodeId);

    const minScore = options?.minAttributionScore ?? 0.0;
    const topAttributions = allAttributions.filter((a) => a.responsibilityScore >= minScore);

    const criticalPath = this.attribution.evaluateCriticalPath(
      graph,
      failureSlice.criticalPathNodeIds
    );

    let interventionImpact: CausalInterventionImpact | undefined = undefined;
    if (topAttributions.length > 0) {
      // Predict impact on the highest responsibility node
      interventionImpact = this.attribution.predictInterventionImpact(
        graph,
        topAttributions[0].nodeId
      );
    }

    // Generate actionable recommendations
    const recommendations: string[] = [];
    if (failureSlice.prunedNodeIds.length > 0) {
      const noiseRatio = Math.round(
        (failureSlice.prunedNodeIds.length / Object.keys(graph.nodes).length) * 100
      );
      if (noiseRatio > 25) {
        recommendations.push(
          `Pruned ${failureSlice.prunedNodeIds.length} non-causal noise nodes (${noiseRatio}% of trajectory). Consider tightening agent prompt to reduce exploratory thrashing.`
        );
      }
    }

    if (topAttributions.length > 0) {
      const top = topAttributions[0];
      if (top.responsibilityScore > 0.6) {
        recommendations.push(
          `Primary root cause identified: [Turn ${top.turnNumber ?? "?"}] ${top.label} (Responsibility: ${(top.responsibilityScore * 100).toFixed(1)}%). Recommended steering intervention at this turn.`
        );
      }
    }

    if (criticalPath.efficiencyRatio < 0.5) {
      recommendations.push(
        `Critical path efficiency is low (${(criticalPath.efficiencyRatio * 100).toFixed(1)}%). Agent spent >50% of turns on dead ends or redundant attempts.`
      );
    }

    return {
      scenarioId: trajectory.scenarioId,
      timestamp: new Date().toISOString(),
      graphSummary: {
        nodeCount: Object.keys(graph.nodes).length,
        edgeCount: graph.edges.length,
        rootCausesCount: topAttributions.filter((a) => a.responsibilityScore >= 0.5).length,
        noiseNodesCount: failureSlice.prunedNodeIds.length,
      },
      criticalPath,
      topAttributions,
      failureSlice,
      interventionImpact,
      recommendations,
    };
  }
}

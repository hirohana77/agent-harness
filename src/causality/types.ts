import { ToolCall, ToolCallResult } from "../core/types.js";

export type CausalNodeType =
  | "initial_state"
  | "agent_turn"
  | "tool_invocation"
  | "artifact_state"
  | "environment_state"
  | "assertion_outcome";

export type CausalEdgeType =
  | "data_read"
  | "data_write"
  | "context_feed"
  | "temporal_flow"
  | "assertion_target";

export interface CausalNode {
  id: string;
  type: CausalNodeType;
  label: string;
  turnNumber?: number;
  toolCallId?: string;
  toolName?: string;
  artifactPath?: string;
  status: "success" | "failure" | "neutral" | "pending";
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface CausalEdge {
  id: string;
  source: string;
  target: string;
  type: CausalEdgeType;
  label?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface CausalGraph {
  scenarioId: string;
  nodes: Record<string, CausalNode>;
  edges: CausalEdge[];
  metadata: {
    totalTurns: number;
    totalNodes: number;
    totalEdges: number;
    generatedAt: string;
    buildDurationMs?: number;
  };
}

export interface CausalSlice {
  targetNodeId: string;
  targetLabel: string;
  ancestorNodeIds: string[];
  prunedNodeIds: string[];
  criticalPathNodeIds: string[];
  causalChainDepth: number;
  sliceCompressionRatio: number;
}

export interface AttributionScore {
  nodeId: string;
  label: string;
  turnNumber?: number;
  toolName?: string;
  responsibilityScore: number; // 0.0 to 1.0
  shapleyWeight: number;       // relative game-theoretic contribution
  directImpact: boolean;       // whether directly connected to target
  depthFromTarget: number;     // shortest path distance from target
  summary: string;
}

export interface CriticalPathResult {
  nodeIds: string[];
  totalTurns: number;
  criticalTurns: number;
  efficiencyRatio: number; // criticalTurns / totalTurns
  bottleneckNodeId?: string;
}

export type InterventionOutcomePrediction =
  | "rescued"
  | "worsened"
  | "neutral"
  | "unknown";

export interface CausalInterventionImpact {
  targetNodeId: string;
  targetLabel: string;
  invalidatedDownstreamNodeIds: string[];
  affectedArtifactPaths: string[];
  predictedOutcomeChange: InterventionOutcomePrediction;
  guidance: string;
}

export interface CausalReport {
  scenarioId: string;
  timestamp: string;
  graphSummary: {
    nodeCount: number;
    edgeCount: number;
    rootCausesCount: number;
    noiseNodesCount: number;
  };
  criticalPath: CriticalPathResult;
  topAttributions: AttributionScore[];
  failureSlice?: CausalSlice;
  interventionImpact?: CausalInterventionImpact;
  recommendations: string[];
}

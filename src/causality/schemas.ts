import { z } from "zod";

export const CausalNodeTypeSchema = z.enum([
  "initial_state",
  "agent_turn",
  "tool_invocation",
  "artifact_state",
  "environment_state",
  "assertion_outcome",
]);

export const CausalEdgeTypeSchema = z.enum([
  "data_read",
  "data_write",
  "context_feed",
  "temporal_flow",
  "assertion_target",
]);

export const CausalNodeSchema = z.object({
  id: z.string(),
  type: CausalNodeTypeSchema,
  label: z.string(),
  turnNumber: z.number().int().nonnegative().optional(),
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  artifactPath: z.string().optional(),
  status: z.enum(["success", "failure", "neutral", "pending"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
});

export const CausalEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  type: CausalEdgeTypeSchema,
  label: z.string().optional(),
  weight: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const CausalGraphSchema = z.object({
  scenarioId: z.string(),
  nodes: z.record(z.string(), CausalNodeSchema),
  edges: z.array(CausalEdgeSchema),
  metadata: z.object({
    totalTurns: z.number().int().nonnegative(),
    totalNodes: z.number().int().nonnegative(),
    totalEdges: z.number().int().nonnegative(),
    generatedAt: z.string(),
    buildDurationMs: z.number().optional(),
  }),
});

export const CausalSliceSchema = z.object({
  targetNodeId: z.string(),
  targetLabel: z.string(),
  ancestorNodeIds: z.array(z.string()),
  prunedNodeIds: z.array(z.string()),
  criticalPathNodeIds: z.array(z.string()),
  causalChainDepth: z.number().int().nonnegative(),
  sliceCompressionRatio: z.number().min(0).max(1),
});

export const AttributionScoreSchema = z.object({
  nodeId: z.string(),
  label: z.string(),
  turnNumber: z.number().int().nonnegative().optional(),
  toolName: z.string().optional(),
  responsibilityScore: z.number().min(0).max(1),
  shapleyWeight: z.number().min(0),
  directImpact: z.boolean(),
  depthFromTarget: z.number().int().nonnegative(),
  summary: z.string(),
});

export const CriticalPathResultSchema = z.object({
  nodeIds: z.array(z.string()),
  totalTurns: z.number().int().nonnegative(),
  criticalTurns: z.number().int().nonnegative(),
  efficiencyRatio: z.number().min(0).max(1),
  bottleneckNodeId: z.string().optional(),
});

export const InterventionOutcomePredictionSchema = z.enum([
  "rescued",
  "worsened",
  "neutral",
  "unknown",
]);

export const CausalInterventionImpactSchema = z.object({
  targetNodeId: z.string(),
  targetLabel: z.string(),
  invalidatedDownstreamNodeIds: z.array(z.string()),
  affectedArtifactPaths: z.array(z.string()),
  predictedOutcomeChange: InterventionOutcomePredictionSchema,
  guidance: z.string(),
});

export const CausalReportSchema = z.object({
  scenarioId: z.string(),
  timestamp: z.string(),
  graphSummary: z.object({
    nodeCount: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    rootCausesCount: z.number().int().nonnegative(),
    noiseNodesCount: z.number().int().nonnegative(),
  }),
  criticalPath: CriticalPathResultSchema,
  topAttributions: z.array(AttributionScoreSchema),
  failureSlice: CausalSliceSchema.optional(),
  interventionImpact: CausalInterventionImpactSchema.optional(),
  recommendations: z.array(z.string()),
});

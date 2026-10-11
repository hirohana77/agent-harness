import { z } from 'zod';
import { TrajectoryStepSummarySchema } from '../comparator/schemas.js';

export const ConsensusStepLevelSchema = z.enum([
  'invariant',
  'majority',
  'minority',
  'outlier',
]);

export const ConsensusSlotSchema = z.object({
  trajectoryId: z.string(),
  stepIndex: z.number().int().nonnegative().optional(),
  step: TrajectoryStepSummarySchema.optional(),
  gap: z.boolean(),
});

export const AlignedConsensusColumnSchema = z.object({
  columnIndex: z.number().int().nonnegative(),
  slots: z.array(ConsensusSlotSchema),
  consensusStep: TrajectoryStepSummarySchema.optional(),
  agreementRate: z.number().min(0).max(1),
  level: ConsensusStepLevelSchema,
  dominantToolName: z.string().optional(),
  isBottleneck: z.boolean(),
  isTrap: z.boolean(),
  activeCount: z.number().int().nonnegative(),
  totalCount: z.number().int().positive(),
});

export const TrajectoryClusterMetricsSchema = z.object({
  totalTrajectories: z.number().int().positive(),
  successfulTrajectories: z.number().int().nonnegative(),
  failedTrajectories: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  averageTurns: z.number().nonnegative(),
  averageTokens: z.number().nonnegative(),
  averageDurationMs: z.number().nonnegative(),
  overallAgreementScore: z.number().min(0).max(100),
  pathDiversityEntropy: z.number().nonnegative(),
  alignmentColumnsCount: z.number().int().nonnegative(),
  invariantStepsCount: z.number().int().nonnegative(),
  majorityStepsCount: z.number().int().nonnegative(),
  minorityStepsCount: z.number().int().nonnegative(),
  outlierStepsCount: z.number().int().nonnegative(),
});

export const BottleneckNodeSchema = z.object({
  columnIndex: z.number().int().nonnegative(),
  step: TrajectoryStepSummarySchema,
  frequency: z.number().min(0).max(1),
  successCorrelation: z.number().min(-1).max(1),
  description: z.string(),
});

export const DeadEndTrapSchema = z.object({
  columnIndex: z.number().int().nonnegative(),
  step: TrajectoryStepSummarySchema,
  failureRate: z.number().min(0).max(1),
  affectedTrajectories: z.array(z.string()),
  errorDetails: z.array(z.string()),
});

export const CanonicalTrajectoryTurnSchema = z.object({
  turnNumber: z.number().int().positive(),
  instruction: z.string().optional(),
  thought: z.string().optional(),
  toolCalls: z.array(z.object({
    toolName: z.string(),
    arguments: z.record(z.string(), z.unknown()),
    result: z.any().optional(),
    durationMs: z.number().optional(),
  })).optional(),
  assistantMessage: z.string().optional(),
});

export const CanonicalTrajectorySchema = z.object({
  scenarioId: z.string(),
  description: z.string().optional(),
  confidenceScore: z.number().min(0).max(100),
  synthesizedFromCount: z.number().int().positive(),
  prunedOutlierStepsCount: z.number().int().nonnegative(),
  turns: z.array(CanonicalTrajectoryTurnSchema),
  totalSteps: z.number().int().nonnegative(),
});

export const TrajectoryRunMetadataSchema = z.object({
  id: z.string(),
  status: z.string(),
  turnsCount: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  model: z.string().optional(),
});

export const ClusterConsensusResultSchema = z.object({
  scenarioId: z.string(),
  metrics: TrajectoryClusterMetricsSchema,
  alignmentColumns: z.array(AlignedConsensusColumnSchema),
  bottlenecks: z.array(BottleneckNodeSchema),
  deadEnds: z.array(DeadEndTrapSchema),
  canonicalTrajectory: CanonicalTrajectorySchema,
  trajectories: z.array(TrajectoryRunMetadataSchema),
});

export const ConsensusOptionsSchema = z.object({
  similarityThreshold: z.number().min(0).max(1).default(0.6),
  strictArgs: z.boolean().default(false),
  bottleneckThreshold: z.number().min(0).max(1).default(0.8),
  deadEndThreshold: z.number().min(0).max(1).default(0.6),
  gapPenalty: z.number().default(-0.5),
  minAgreementRate: z.number().min(0).max(1).default(0.5),
});

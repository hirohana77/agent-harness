import { z } from 'zod';
import { ToolCallResultSchema } from '../core/schemas.js';

export const TrajectoryStepSummarySchema = z.object({
  turnNumber: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  stepType: z.enum(['tool', 'turn_end']),
  toolName: z.string().optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  result: ToolCallResultSchema.optional(),
  thought: z.string().optional(),
  assistantMessage: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
});

export const StepAlignmentTypeSchema = z.enum([
  'match',
  'modified',
  'added',
  'removed',
]);

export const AlignedStepSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  baselineStep: TrajectoryStepSummarySchema.optional(),
  candidateStep: TrajectoryStepSummarySchema.optional(),
  alignmentType: StepAlignmentTypeSchema,
  similarity: z.number().min(0).max(1),
  divergenceDetails: z.string().optional(),
});

export const DivergenceTypeSchema = z.enum([
  'tool_mismatch',
  'arg_mismatch',
  'tool_failure',
  'status_regression',
  'turn_budget_drift',
  'loop_detected',
  'premature_exit',
]);

export const DivergencePointSchema = z.object({
  turnNumber: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  type: DivergenceTypeSchema,
  description: z.string(),
  baseline: z.record(z.string(), z.unknown()).optional(),
  candidate: z.record(z.string(), z.unknown()).optional(),
});

export const RegressionSeveritySchema = z.enum([
  'identical',
  'equivalent',
  'minor_drift',
  'regression',
  'critical_failure',
]);

export const TrajectoryAnomalyTypeSchema = z.enum([
  'loop_detected',
  'error_spike',
  'token_explosion',
  'empty_turn',
  'rapid_failure',
]);

export const TrajectoryAnomalySchema = z.object({
  type: TrajectoryAnomalyTypeSchema,
  message: z.string(),
  turnNumber: z.number().int().nonnegative().optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const TrajectoryDiffSummarySchema = z.object({
  status: z.object({
    baseline: z.string(),
    candidate: z.string(),
    regressed: z.boolean(),
  }),
  turns: z.object({
    baseline: z.number().int().nonnegative(),
    candidate: z.number().int().nonnegative(),
    delta: z.number(),
  }),
  toolCalls: z.object({
    baseline: z.number().int().nonnegative(),
    candidate: z.number().int().nonnegative(),
    delta: z.number(),
  }),
  tokens: z.object({
    baselinePrompt: z.number().nonnegative(),
    candidatePrompt: z.number().nonnegative(),
    promptDelta: z.number(),
    baselineCompletion: z.number().nonnegative(),
    candidateCompletion: z.number().nonnegative(),
    completionDelta: z.number(),
    baselineTotal: z.number().nonnegative(),
    candidateTotal: z.number().nonnegative(),
    totalDelta: z.number(),
  }),
  durationMs: z.object({
    baseline: z.number().nonnegative(),
    candidate: z.number().nonnegative(),
    delta: z.number(),
  }),
  costUsd: z.object({
    baseline: z.number().nonnegative(),
    candidate: z.number().nonnegative(),
    delta: z.number(),
  }),
});

export const TrajectoryRegressionAnalysisSchema = z.object({
  severity: RegressionSeveritySchema,
  score: z.number().min(0).max(1),
  isRegression: z.boolean(),
  reasons: z.array(z.string()),
  anomalies: z.array(TrajectoryAnomalySchema),
});

export const TrajectoryDiffSchema = z.object({
  scenarioId: z.string(),
  summary: TrajectoryDiffSummarySchema,
  firstDivergence: DivergencePointSchema.optional(),
  allDivergences: z.array(DivergencePointSchema),
  alignment: z.array(AlignedStepSchema),
  regression: TrajectoryRegressionAnalysisSchema,
  toolDistribution: z.record(
    z.string(),
    z.object({
      baseline: z.number().int().nonnegative(),
      candidate: z.number().int().nonnegative(),
      delta: z.number(),
    })
  ),
});

export const TrajectoryCompareOptionsSchema = z.object({
  strictArgs: z.boolean().default(false),
  tokenRegressionRatio: z.number().positive().default(0.5),
  minSimilarityThreshold: z.number().min(0).max(1).default(0.6),
  maxAcceptableDivergences: z.number().int().nonnegative().default(2),
  failOnRegression: z.boolean().default(false),
});

export const AssertionDiffStatusSchema = z.enum([
  'maintained_pass',
  'maintained_fail',
  'regression',
  'improvement',
]);

export const AssertionDiffItemSchema = z.object({
  type: z.enum(['file', 'command', 'trajectory', 'ast']),
  target: z.string(),
  baselinePassed: z.boolean(),
  candidatePassed: z.boolean(),
  status: AssertionDiffStatusSchema,
  message: z.string().optional(),
});

export const ReportDiffSchema = z.object({
  scenarioId: z.string(),
  baselinePassed: z.boolean(),
  candidatePassed: z.boolean(),
  isRegression: z.boolean(),
  assertions: z.array(AssertionDiffItemSchema),
  trajectoryDiff: TrajectoryDiffSchema.optional(),
});

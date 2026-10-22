import { z } from "zod";

export const ReflexionErrorClassSchema = z.enum([
  "command-failure",
  "test-regression",
  "file-not-found",
  "tool-error",
  "syntax-ast-error",
  "permission-denied",
  "hallucinated-tool",
]);

export const ReflexionEpisodeStatusSchema = z.enum([
  "recovered",
  "thrashing",
  "oscillating",
  "abandoned",
  "regressed",
  "exhausted",
]);

export const ReflexionPathologyTypeSchema = z.enum([
  "repetitive-thrashing",
  "blind-retry",
  "error-ignorance",
  "oscillation",
  "cascading-regression",
]);

export const ReflexionRecoveryStrategySchema = z.enum([
  "parameter-adjustment",
  "alternative-tool",
  "code-patch-rework",
  "workspace-cleanup",
  "rollback-and-restart",
  "multi-step-investigation",
]);

export const ReflexionReportFormatSchema = z.enum(["terminal", "markdown", "json"]);

export const FailureEpisodeSchema = z.object({
  id: z.string(),
  errorClass: ReflexionErrorClassSchema,
  triggerTurn: z.number().int().positive(),
  triggerToolCallId: z.string().optional(),
  triggerToolName: z.string(),
  errorMessage: z.string(),
  exitCode: z.number().optional(),
  status: ReflexionEpisodeStatusSchema,
  recoveryTurn: z.number().int().positive().optional(),
  turnSpan: z.number().int().nonnegative().default(1),
  detectedPathologies: z.array(ReflexionPathologyTypeSchema).default([]),
  strategy: ReflexionRecoveryStrategySchema.optional(),
  evidence: z.string().optional(),
  resolutionProof: z.string().optional(),
});

export const PathologyFindingSchema = z.object({
  id: z.string(),
  type: ReflexionPathologyTypeSchema,
  episodeId: z.string().optional(),
  turnRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string(),
  evidence: z.string(),
  suggestedRemediation: z.string(),
});

export const ErrorClassStatSchema = z.object({
  total: z.number().int().nonnegative(),
  recovered: z.number().int().nonnegative(),
  recoveryRate: z.number().min(0).max(1),
});

export const ReflexionMetricsSchema = z.object({
  totalEpisodes: z.number().int().nonnegative(),
  recoveredEpisodes: z.number().int().nonnegative(),
  unresolvedEpisodes: z.number().int().nonnegative(),
  selfHealingRate: z.number().min(0).max(1),
  meanTurnsToRecovery: z.number().nonnegative(),
  medianTurnsToRecovery: z.number().nonnegative(),
  thrashingIndex: z.number().min(0).max(100),
  cognitiveResilienceScore: z.number().min(0).max(100),
  pathologyCount: z.number().int().nonnegative(),
  strategyDistribution: z.record(ReflexionRecoveryStrategySchema, z.number().int().nonnegative()),
  errorClassDistribution: z.record(ReflexionErrorClassSchema, ErrorClassStatSchema),
});

export const ReflexionReportSchema = z.object({
  scenarioId: z.string(),
  agentId: z.string().optional(),
  timestamp: z.string(),
  metrics: ReflexionMetricsSchema,
  episodes: z.array(FailureEpisodeSchema),
  pathologies: z.array(PathologyFindingSchema),
  recommendations: z.array(z.string()),
});

export const ComparisonVerdictSchema = z.enum([
  "significantly_improved",
  "moderately_improved",
  "neutral",
  "degraded",
]);

export const ReflexionComparisonResultSchema = z.object({
  baseline: z.object({
    scenarioId: z.string(),
    metrics: ReflexionMetricsSchema,
  }),
  comparative: z.object({
    scenarioId: z.string(),
    metrics: ReflexionMetricsSchema,
  }),
  deltaSelfHealingRate: z.number(),
  deltaMeanTurnsToRecovery: z.number(),
  deltaResilienceScore: z.number(),
  deltaPathologyCount: z.number(),
  verdict: ComparisonVerdictSchema,
  summary: z.string(),
});

export const ReflexionAnalysisOptionsSchema = z.object({
  maxThrashingThreshold: z.number().int().positive().optional().default(3),
  detectPathologies: z.boolean().optional().default(true),
  testCommandPatterns: z.array(z.string()).optional(),
  format: ReflexionReportFormatSchema.optional().default("terminal"),
});

export const ReflexionPromptConfigSchema = z.object({
  maxPreviousAttempts: z.number().int().positive().optional().default(3),
  includePathologies: z.boolean().optional().default(true),
  includeSuggestedAction: z.boolean().optional().default(true),
});

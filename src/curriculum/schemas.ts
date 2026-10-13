import { z } from 'zod';
import { ScenarioDefinitionSchema } from '../core/schemas.js';

export const CurriculumDifficultyLevelSchema = z.enum([
  'novice',
  'intermediate',
  'advanced',
  'adversarial',
]);

export const WeaknessCategorySchema = z.enum([
  'ast_syntax_error',
  'security_violation',
  'infinite_loop',
  'budget_exhaustion',
  'command_flakiness',
  'file_integrity',
  'tool_format_error',
]);

export const MutationDimensionSchema = z.enum([
  'instruction',
  'workspace',
  'verifier',
  'environment',
]);

export const AppliedMutationRecordSchema = z.object({
  dimension: MutationDimensionSchema,
  description: z.string(),
  targetWeakness: WeaknessCategorySchema.optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const TaskMutationConfigSchema = z.object({
  seed: z.number().int().default(42),
  difficulty: CurriculumDifficultyLevelSchema.default('intermediate'),
  dimensions: z.array(MutationDimensionSchema).default(['instruction', 'workspace', 'verifier']),
  targetWeaknesses: z.array(WeaknessCategorySchema).default([]),
  noiseRatio: z.number().min(0).max(1).default(0.2),
  budgetScale: z.number().positive().default(1.0),
  injectChaos: z.boolean().default(false),
});

export const MutatedScenarioSchema = ScenarioDefinitionSchema.extend({
  parentScenarioId: z.string().default('base'),
  mutationLevel: CurriculumDifficultyLevelSchema.default('intermediate'),
  appliedMutations: z.array(AppliedMutationRecordSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const WeaknessProfileSchema = z.object({
  totalEvaluated: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  categoryScores: z.record(WeaknessCategorySchema, z.number().min(0).max(1)),
  categoryOccurrences: z.record(WeaknessCategorySchema, z.number().int().nonnegative()),
  criticalWeaknesses: z.array(WeaknessCategorySchema),
  recommendedCurriculumStages: z.array(CurriculumDifficultyLevelSchema),
});

export const CurriculumStageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  difficulty: CurriculumDifficultyLevelSchema,
  scenarios: z.array(ScenarioDefinitionSchema).min(1),
  passRateThreshold: z.number().min(0).max(1).default(0.75),
  maxRetries: z.number().int().nonnegative().default(1),
  enableGuidance: z.boolean().default(false),
  description: z.string().optional(),
});

export const CurriculumPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  stages: z.array(CurriculumStageSchema).min(1),
  adaptiveGating: z.boolean().default(true),
  initialCompetencyScore: z.number().positive().default(1000),
});

export const ScenarioResultSummarySchema = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
  tokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative().default(0),
});

export const StageExecutionResultSchema = z.object({
  stageId: z.string(),
  stageName: z.string(),
  difficulty: CurriculumDifficultyLevelSchema,
  passed: z.boolean(),
  passRate: z.number().min(0).max(1),
  totalScenarios: z.number().int().nonnegative(),
  passedScenarios: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  tokensUsed: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  guidanceInjected: z.boolean(),
  scenarioResults: z.array(ScenarioResultSummarySchema),
});

export const RemediationMetricsSchema = z.object({
  baselinePassRate: z.number().min(0).max(1),
  guidedPassRate: z.number().min(0).max(1),
  guidanceUpliftPercent: z.number(),
  weaknessRemediations: z.record(
    WeaknessCategorySchema,
    z.object({
      beforeFailureRate: z.number().min(0).max(1),
      afterFailureRate: z.number().min(0).max(1),
      remediated: z.boolean(),
    })
  ),
});

export const CurriculumResultSchema = z.object({
  curriculumId: z.string(),
  curriculumName: z.string(),
  passed: z.boolean(),
  completedStages: z.number().int().nonnegative(),
  totalStages: z.number().int().positive(),
  initialCompetency: z.number(),
  finalCompetency: z.number(),
  competencyDelta: z.number(),
  stages: z.array(StageExecutionResultSchema),
  remediationMetrics: RemediationMetricsSchema,
  totalDurationMs: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
});

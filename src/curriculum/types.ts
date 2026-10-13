import { z } from 'zod';
import {
  CurriculumDifficultyLevelSchema,
  WeaknessCategorySchema,
  MutationDimensionSchema,
  AppliedMutationRecordSchema,
  TaskMutationConfigSchema,
  MutatedScenarioSchema,
  WeaknessProfileSchema,
  CurriculumStageSchema,
  CurriculumPlanSchema,
  ScenarioResultSummarySchema,
  StageExecutionResultSchema,
  RemediationMetricsSchema,
  CurriculumResultSchema,
} from './schemas.js';
import { AgentAdapter, ScenarioDefinition, HarnessReport } from '../core/types.js';
import { DistilledPolicy } from '../distillation/types.js';

export type CurriculumDifficultyLevel = z.infer<typeof CurriculumDifficultyLevelSchema>;
export type WeaknessCategory = z.infer<typeof WeaknessCategorySchema>;
export type MutationDimension = z.infer<typeof MutationDimensionSchema>;
export type AppliedMutationRecord = z.infer<typeof AppliedMutationRecordSchema>;
export type TaskMutationConfig = z.infer<typeof TaskMutationConfigSchema>;
export type MutatedScenario = z.infer<typeof MutatedScenarioSchema>;
export type WeaknessProfile = z.infer<typeof WeaknessProfileSchema>;
export type CurriculumStage = z.infer<typeof CurriculumStageSchema>;
export type CurriculumPlan = z.infer<typeof CurriculumPlanSchema>;
export type ScenarioResultSummary = z.infer<typeof ScenarioResultSummarySchema>;
export type StageExecutionResult = z.infer<typeof StageExecutionResultSchema>;
export type RemediationMetrics = z.infer<typeof RemediationMetricsSchema>;
export type CurriculumResult = z.infer<typeof CurriculumResultSchema>;

export interface MutatorContext {
  seed: number;
  difficulty: CurriculumDifficultyLevel;
  noiseRatio: number;
  targetWeaknesses: WeaknessCategory[];
  budgetScale: number;
}

export interface ScenarioMutator {
  dimension: MutationDimension;
  mutate(scenario: ScenarioDefinition, ctx: MutatorContext): {
    scenario: ScenarioDefinition;
    mutations: AppliedMutationRecord[];
  };
}

export interface CurriculumExecutionOptions {
  agent: AgentAdapter;
  plan: CurriculumPlan;
  guidancePolicy?: DistilledPolicy;
  concurrency?: number;
  stopOnGatingFailure?: boolean;
  outputDir?: string;
  onStageStart?: (stage: CurriculumStage) => void;
  onStageComplete?: (stage: CurriculumStage, result: StageExecutionResult) => void;
  onScenarioComplete?: (stage: CurriculumStage, summary: ScenarioResultSummary) => void;
}

export interface WeaknessAnalysisInput {
  reports: HarnessReport[];
  baselineScenarios?: ScenarioDefinition[];
}

export interface CompetencyUpdate {
  previousScore: number;
  newScore: number;
  delta: number;
  stageMultiplier: number;
}

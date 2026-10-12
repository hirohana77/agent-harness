import { z } from 'zod';
import {
  MilestoneImportanceSchema,
  MilestoneGuidanceSchema,
  NegativePatternSeveritySchema,
  NegativePatternGuidanceSchema,
  FewShotTurnSchema,
  FewShotExemplarSchema,
  SteeringActionBlueprintSchema,
  DistilledPolicyMetadataSchema,
  DistilledPolicySchema,
  DistillationOptionsSchema,
  DynamicGuidanceFeedbackSchema,
  GuidanceStateSchema,
} from './schemas.js';

export type MilestoneImportance = z.infer<typeof MilestoneImportanceSchema>;
export type MilestoneGuidance = z.infer<typeof MilestoneGuidanceSchema>;
export type NegativePatternSeverity = z.infer<typeof NegativePatternSeveritySchema>;
export type NegativePatternGuidance = z.infer<typeof NegativePatternGuidanceSchema>;
export type FewShotTurn = z.infer<typeof FewShotTurnSchema>;
export type FewShotExemplar = z.infer<typeof FewShotExemplarSchema>;
export type SteeringActionBlueprint = z.infer<typeof SteeringActionBlueprintSchema>;
export type DistilledPolicyMetadata = z.infer<typeof DistilledPolicyMetadataSchema>;
export type DistilledPolicy = z.infer<typeof DistilledPolicySchema>;
export type DistillationOptions = z.infer<typeof DistillationOptionsSchema>;
export type DynamicGuidanceFeedback = z.infer<typeof DynamicGuidanceFeedbackSchema>;
export type GuidanceState = z.infer<typeof GuidanceStateSchema>;

export interface StepEvaluationContext {
  turnNumber: number;
  toolName: string;
  arguments: Record<string, unknown>;
  previousResult?: {
    success?: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
  };
  agentThought?: string;
}

export type DistillationReportFormat = 'terminal' | 'markdown' | 'json' | 'fewshot' | 'steering';

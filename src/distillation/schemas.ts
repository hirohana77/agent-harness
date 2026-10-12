import { z } from 'zod';
import { BreakpointRuleSchema, InterventionActionSchema } from '../steering/schemas.js';

export const MilestoneImportanceSchema = z.enum(['critical', 'recommended', 'optional']);

export const MilestoneGuidanceSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().positive(),
  name: z.string(),
  description: z.string(),
  targetTool: z.string(),
  argumentPattern: z.string().optional(),
  expectedOutcomePattern: z.string().optional(),
  isInvariant: z.boolean().default(true),
  importance: MilestoneImportanceSchema.default('recommended'),
});

export const NegativePatternSeveritySchema = z.enum(['critical', 'warning', 'info']);

export const NegativePatternGuidanceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  triggerTool: z.string(),
  argumentPattern: z.string().optional(),
  errorKeywords: z.array(z.string()).default([]),
  severity: NegativePatternSeveritySchema.default('warning'),
  reason: z.string(),
  remedyHint: z.string(),
  occurrenceCount: z.number().int().nonnegative().default(1),
});

export const FewShotTurnSchema = z.object({
  turnNumber: z.number().int().positive(),
  role: z.enum(['user', 'assistant', 'system', 'tool']).default('assistant'),
  thought: z.string().optional(),
  toolCalls: z
    .array(
      z.object({
        toolName: z.string(),
        arguments: z.record(z.string(), z.unknown()),
        result: z.any().optional(),
        durationMs: z.number().optional(),
      })
    )
    .optional(),
  assistantMessage: z.string().optional(),
});

export const FewShotExemplarSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  turns: z.array(FewShotTurnSchema),
  tokenEstimate: z.number().int().nonnegative(),
  isPruned: z.boolean().default(false),
});

export const SteeringActionBlueprintSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  breakpoint: BreakpointRuleSchema,
  intervention: InterventionActionSchema,
  description: z.string(),
});

export const DistilledPolicyMetadataSchema = z.object({
  scenarioId: z.string(),
  source: z.enum(['canonical_trajectory', 'consensus_cluster', 'raw_trajectory']),
  createdAt: z.string(),
  confidenceScore: z.number().min(0).max(100),
  sourceTrajectoriesCount: z.number().int().positive(),
  totalMilestones: z.number().int().nonnegative(),
  totalAntiPatterns: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
});

export const DistilledPolicySchema = z.object({
  metadata: DistilledPolicyMetadataSchema,
  taskInstruction: z.string().optional(),
  milestones: z.array(MilestoneGuidanceSchema),
  antiPatterns: z.array(NegativePatternGuidanceSchema),
  fewShotExemplar: FewShotExemplarSchema.optional(),
  steeringRules: z.array(SteeringActionBlueprintSchema).default([]),
  promptGuidance: z.string().optional(),
});

export const DistillationOptionsSchema = z.object({
  tokenBudget: z.number().int().positive().default(1500),
  targetModelFormat: z.enum(['openai', 'anthropic', 'generic', 'markdown']).default('generic'),
  includeNegativeGuidance: z.boolean().default(true),
  includeSteeringRules: z.boolean().default(true),
  compressRedundantSteps: z.boolean().default(true),
  maxMilestones: z.number().int().positive().default(10),
  maxAntiPatterns: z.number().int().positive().default(10),
  strictness: z.enum(['strict', 'lenient', 'adaptive']).default('adaptive'),
});

export const DynamicGuidanceFeedbackSchema = z.object({
  action: z.enum(['continue', 'hint', 'warn', 'block', 'milestone_advance', 'diverged']),
  severity: NegativePatternSeveritySchema.default('info'),
  message: z.string(),
  milestoneId: z.string().optional(),
  patternId: z.string().optional(),
  suggestedAlternative: z.string().optional(),
});

export const GuidanceStateSchema = z.object({
  currentMilestoneIndex: z.number().int().nonnegative().default(0),
  completedMilestones: z.array(z.string()).default([]),
  warningsIssued: z.number().int().nonnegative().default(0),
  blocksTriggered: z.number().int().nonnegative().default(0),
  status: z.enum(['tracking', 'milestones_complete', 'diverged', 'blocked']).default('tracking'),
});

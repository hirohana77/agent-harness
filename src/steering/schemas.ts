import { z } from 'zod';

export const BreakpointTypeSchema = z.enum([
  'tool',
  'error_count',
  'turn',
  'budget_ratio',
  'custom',
]);

export const BreakpointRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  type: BreakpointTypeSchema,
  enabled: z.boolean().default(true),
  once: z.boolean().default(false),
  hitCount: z.number().int().nonnegative().default(0),
  toolPattern: z.string().optional(),
  argumentMatch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  errorThreshold: z.number().int().positive().optional(),
  turnThreshold: z.number().int().positive().optional(),
  budgetRatioThreshold: z.number().min(0).max(1).optional(),
});

export const InterventionActionTypeSchema = z.enum([
  'continue',
  'inject_prompt',
  'override_tool',
  'skip_tool',
  'abort',
]);

export const InterventionActionSchema = z.object({
  type: InterventionActionTypeSchema,
  prompt: z.string().optional(),
  overrideResult: z
    .object({
      success: z.boolean(),
      output: z.string().optional(),
      error: z.string().optional(),
      exitCode: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  reason: z.string().optional(),
  timestamp: z.string().optional(),
});

export const AddBreakpointRequestSchema = BreakpointRuleSchema.omit({
  hitCount: true,
}).partial({
  id: true,
  enabled: true,
  once: true,
});

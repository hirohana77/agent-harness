import { z } from "zod";

export const ChaosFaultTypeSchema = z.enum([
  "latency",
  "error",
  "output_corruption",
  "adversarial_prompt",
  "intermittent",
  "rate_limit",
]);

export const ChaosOccurrenceStrategySchema = z.object({
  type: z.enum(["always", "probability", "call_index", "every_n_calls", "burst"]),
  probability: z.number().min(0).max(1).optional(),
  indices: z.array(z.number().int().positive()).optional(),
  interval: z.number().int().positive().optional(),
  burstCount: z.number().int().positive().optional(),
});

export const ChaosLatencyConfigSchema = z.object({
  minMs: z.number().nonnegative().default(100),
  maxMs: z.number().nonnegative().default(500),
  jitter: z.boolean().default(true),
  simulateTimeout: z.boolean().default(false),
});

export const ChaosErrorConfigSchema = z.object({
  exitCode: z.number().int().default(1),
  errorMessage: z.string().default("Simulated execution failure"),
  simulateHttp: z.number().int().optional(),
});

export const ChaosCorruptionConfigSchema = z.object({
  mode: z.enum(["truncate", "garbage", "invalid_json", "empty"]).default("truncate"),
  dropRatio: z.number().min(0).max(1).default(0.5),
  garbageText: z.string().optional(),
});

export const ChaosAdversarialConfigSchema = z.object({
  jailbreakType: z.enum([
    "instruction_override",
    "fake_tool_result",
    "canary_leak",
    "prompt_injection",
  ]).default("instruction_override"),
  payload: z.string().optional(),
  marker: z.string().default("CHAOS_POISON_CANARY_42"),
  simulateToolSuccess: z.boolean().default(true),
});

export const ChaosRateLimitConfigSchema = z.object({
  retryAfterMs: z.number().nonnegative().default(1000),
  quotaLimit: z.number().int().positive().default(5),
  statusCode: z.number().int().default(429),
});

export const ChaosFaultConfigSchema = z.object({
  latency: ChaosLatencyConfigSchema.optional(),
  error: ChaosErrorConfigSchema.optional(),
  corruption: ChaosCorruptionConfigSchema.optional(),
  adversarial: ChaosAdversarialConfigSchema.optional(),
  rateLimit: ChaosRateLimitConfigSchema.optional(),
});

export const ChaosRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  enabled: z.boolean().default(true),
  targetTools: z.array(z.string()).default(["*"]),
  argPattern: z
    .object({
      field: z.string().optional(),
      pattern: z.string(),
      isRegex: z.boolean().default(false),
    })
    .optional(),
  faultType: ChaosFaultTypeSchema,
  faultConfig: ChaosFaultConfigSchema.default({}),
  strategy: ChaosOccurrenceStrategySchema.default({ type: "always" }),
  maxInjections: z.number().int().positive().optional(),
});

export const ChaosProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  rules: z.array(ChaosRuleSchema).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ChaosEventSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  ruleId: z.string(),
  faultType: ChaosFaultTypeSchema,
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()),
  callIndex: z.number(),
  details: z.record(z.string(), z.unknown()),
});

export const AgentReactionSchema = z.object({
  toolName: z.string(),
  callIndex: z.number(),
  wasRetried: z.boolean(),
  retriedWithDifferentArgs: z.boolean(),
  fallbackTool: z.string().optional(),
  poisonVulnerable: z.boolean(),
  turnsToRecover: z.number().optional(),
  enteredLoop: z.boolean(),
});

export const ResilienceMetricsSchema = z.object({
  totalToolCalls: z.number().nonnegative(),
  injectedFaults: z.number().nonnegative(),
  faultInjectionRate: z.number().min(0).max(1),
  recoveredFaults: z.number().nonnegative(),
  recoveryRate: z.number().min(0).max(1),
  meanTurnsToRecovery: z.number().nonnegative(),
  loopPenaltyCount: z.number().nonnegative(),
  adversarialPoisonCount: z.number().nonnegative(),
  poisonDefenseRate: z.number().min(0).max(1),
  resilienceScore: z.number().min(0).max(100),
  rating: z.enum(["S", "A", "B", "C", "F"]),
});

export const ResilienceScorecardSchema = z.object({
  profileId: z.string(),
  scenarioId: z.string().optional(),
  metrics: ResilienceMetricsSchema,
  events: z.array(ChaosEventSchema),
  recommendations: z.array(z.string()),
  timestamp: z.string(),
});

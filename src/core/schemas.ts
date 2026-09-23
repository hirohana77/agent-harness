import { z } from 'zod';

export const BudgetsSchema = z.object({
  maxTurns: z.number().int().positive().default(20),
  timeoutMs: z.number().int().positive().default(60000),
  maxTokens: z.number().int().positive().default(100000),
  maxCostUsd: z.number().positive().optional(),
});

export const SecurityPolicySchema = z.object({
  allowedCommands: z.array(z.string()).default(['*']),
  deniedCommands: z.array(z.string()).default([
    'rm -rf /',
    'rm -rf ~',
    ':(){ :|:& };:',
    'mkfs',
    'dd if=/dev/zero',
    'shutdown',
    'reboot',
  ]),
  allowedPaths: z.array(z.string()).default(['.']),
  networkEnabled: z.boolean().default(false),
});

export const WorkspaceConfigSchema = z.object({
  templatePath: z.string().optional(),
  initialFiles: z.record(z.string(), z.string()).default({}),
  gitInit: z.boolean().default(true),
  cleanup: z.boolean().default(true),
});

export const TaskConfigSchema = z.object({
  instruction: z.string().min(1),
  contextFiles: z.array(z.string()).default([]),
  expectedOutcome: z.string().optional(),
});

export const FileAssertionSchema = z.object({
  path: z.string(),
  shouldExist: z.boolean().default(true),
  contains: z.union([z.string(), z.array(z.string())]).optional(),
  notContains: z.union([z.string(), z.array(z.string())]).optional(),
  matchesRegex: z.string().optional(),
  exactContent: z.string().optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
});

export const CommandAssertionSchema = z.object({
  name: z.string().optional(),
  command: z.string(),
  expectedExitCode: z.number().int().default(0),
  stdoutContains: z.string().optional(),
  stderrContains: z.string().optional(),
  timeoutMs: z.number().int().positive().default(15000),
});

export const TrajectoryAssertionRuleSchema = z.enum([
  'max_turns',
  'min_turns',
  'tool_used',
  'tool_not_used',
  'max_tokens',
  'no_security_violations',
  'max_cost',
]);

export const TrajectoryAssertionSchema = z.object({
  rule: TrajectoryAssertionRuleSchema,
  param: z.unknown().optional(),
  description: z.string().optional(),
});

export const ScenarioAssertionsSchema = z.object({
  files: z.array(FileAssertionSchema).default([]),
  commands: z.array(CommandAssertionSchema).default([]),
  trajectory: z.array(TrajectoryAssertionSchema).default([]),
});

export const ScenarioDefinitionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-_]+$/i, 'Scenario ID must be alphanumeric with hyphens or underscores'),
  name: z.string().min(1),
  description: z.string().default(''),
  version: z.string().default('1.0.0'),
  workspace: WorkspaceConfigSchema.default(() => WorkspaceConfigSchema.parse({})),
  budgets: BudgetsSchema.default(() => BudgetsSchema.parse({})),
  security: SecurityPolicySchema.default(() => SecurityPolicySchema.parse({})),
  task: TaskConfigSchema,
  assertions: ScenarioAssertionsSchema.default(() => ScenarioAssertionsSchema.parse({})),
});

export const ToolCallResultSchema = z.object({
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
});

export const ToolCallSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.string(), z.unknown()).default({}),
  result: ToolCallResultSchema.optional(),
  durationMs: z.number().default(0),
});

export const AgentTurnSchema = z.object({
  turnNumber: z.number().int().positive(),
  prompt: z.string(),
  thought: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).default([]),
  assistantMessage: z.string().optional(),
  tokensUsed: z.object({
    promptTokens: z.number().int().nonnegative().default(0),
    completionTokens: z.number().int().nonnegative().default(0),
    totalTokens: z.number().int().nonnegative().default(0),
  }).default({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
});

export const TrajectorySummarySchema = z.object({
  totalTurns: z.number().int().nonnegative(),
  totalToolCalls: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative().default(0),
  completed: z.boolean(),
});

export const TrajectorySchema = z.object({
  scenarioId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  durationMs: z.number().nonnegative().default(0),
  status: z.enum([
    'idle',
    'running',
    'completed',
    'timeout',
    'budget_exceeded',
    'security_violation',
    'error',
  ]).default('idle'),
  turns: z.array(AgentTurnSchema).default([]),
  summary: TrajectorySummarySchema.default({
    totalTurns: 0,
    totalToolCalls: 0,
    totalTokens: 0,
    costUsd: 0,
    completed: false,
  }),
});

export const AssertionItemResultSchema = z.object({
  type: z.enum(['file', 'command', 'trajectory']),
  target: z.string(),
  passed: z.boolean(),
  message: z.string(),
  durationMs: z.number().default(0),
  details: z.unknown().optional(),
});

export const HarnessReportSchema = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  timestamp: z.string(),
  passed: z.boolean(),
  metrics: z.object({
    durationMs: z.number(),
    totalTurns: z.number(),
    totalAssertions: z.number(),
    passedAssertions: z.number(),
    failedAssertions: z.number(),
    totalTokens: z.number(),
    costUsd: z.number(),
  }),
  assertionResults: z.array(AssertionItemResultSchema),
  trajectorySummary: TrajectorySummarySchema,
});

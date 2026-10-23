import { z } from "zod";

export const VirtualFileSchema = z.object({
  path: z.string(),
  content: z.string(),
  hash: z.string(),
  size: z.number().int().nonnegative(),
  lastModifiedTurn: z.number().int().nonnegative(),
});

export const VirtualFSStateSchema = z.record(z.string(), VirtualFileSchema);

export const FileDeltaTypeSchema = z.enum(["created", "modified", "deleted", "unchanged"]);

export const FileDeltaSchema = z.object({
  path: z.string(),
  type: FileDeltaTypeSchema,
  oldHash: z.string().optional(),
  newHash: z.string().optional(),
  oldContent: z.string().optional(),
  newContent: z.string().optional(),
  patchPreview: z.string().optional(),
});

export const BreakpointConditionTypeSchema = z.enum([
  "turn",
  "tool",
  "exit-code",
  "error-pattern",
  "file-changed",
  "custom",
]);

export const BreakpointConditionSchema = z.object({
  type: BreakpointConditionTypeSchema,
  turnNumber: z.number().int().positive().optional(),
  toolName: z.string().optional(),
  exitCode: z.number().int().optional(),
  pattern: z.string().optional(),
  filePath: z.string().optional(),
});

export const BreakpointSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  enabled: z.boolean(),
  condition: BreakpointConditionSchema,
  hitCount: z.number().int().nonnegative(),
  action: z.enum(["pause", "log"]).optional(),
});

export const WatchpointTriggerTypeSchema = z.enum(["create", "modify", "delete", "any"]);

export const WatchpointSchema = z.object({
  id: z.string(),
  path: z.string(),
  triggerOn: WatchpointTriggerTypeSchema,
  enabled: z.boolean(),
  hitCount: z.number().int().nonnegative(),
});

export const BuiltinPredicateTypeSchema = z.enum([
  "exit-code-success",
  "file-exists",
  "file-contains",
  "no-error-output",
  "custom",
]);

export const BisectEvaluationStepSchema = z.object({
  turnNumber: z.number().int().positive(),
  passed: z.boolean(),
  reason: z.string().optional(),
  snapshotSnippet: z.string().optional(),
});

export const BisectResultSchema = z.object({
  firstFaultyTurn: z.number().int().positive().nullable(),
  stepsEvaluated: z.number().int().nonnegative(),
  evaluations: z.array(BisectEvaluationStepSchema),
  rootCauseDescription: z.string(),
  confidence: z.number().min(0).max(1),
  durationMs: z.number().nonnegative(),
});

export const MutationTypeSchema = z.enum([
  "override-tool-result",
  "patch-file",
  "delete-file",
  "inject-prompt",
  "modify-arguments",
]);

export const CounterfactualMutationSchema = z.object({
  type: MutationTypeSchema,
  targetCallId: z.string().optional(),
  targetTool: z.string().optional(),
  mockResult: z
    .object({
      success: z.boolean().optional(),
      exitCode: z.number().optional(),
      output: z.string().optional(),
      error: z.string().optional(),
    })
    .optional(),
  filePath: z.string().optional(),
  fileContent: z.string().optional(),
  injectedPrompt: z.string().optional(),
  modifiedArgs: z.record(z.string(), z.unknown()).optional(),
  description: z.string().optional(),
});

export const BranchOutcomeDeltaSchema = z.object({
  originalCompleted: z.boolean(),
  branchCompleted: z.boolean(),
  originalTurns: z.number().int().nonnegative(),
  branchTurns: z.number().int().nonnegative(),
  originalTokens: z.number().int().nonnegative(),
  branchTokens: z.number().int().nonnegative(),
  divergenceTurn: z.number().int().nonnegative(),
  turnReduction: z.number().int(),
  statusChange: z.enum(["rescued", "worsened", "neutral", "identical"]),
});

export const CounterfactualBranchSchema = z.object({
  branchId: z.string(),
  branchName: z.string(),
  forkTurn: z.number().int().nonnegative(),
  mutations: z.array(CounterfactualMutationSchema),
  divergedFromBaseline: z.boolean(),
  divergenceTurn: z.number().int().nonnegative().optional(),
  outcomeDelta: BranchOutcomeDeltaSchema,
  createdAt: z.string(),
});

export const TimeTravelReportFormatSchema = z.enum(["terminal", "markdown", "json"]);

export const TimelineTurnEntrySchema = z.object({
  turnNumber: z.number().int().positive(),
  toolNames: z.array(z.string()),
  exitCodes: z.array(z.number()),
  deltasCount: z.number().int().nonnegative(),
  status: z.enum(["success", "failure", "warning"]),
  hitBreakpointIds: z.array(z.string()).optional(),
});

export const TimeTravelReportSchema = z.object({
  scenarioId: z.string(),
  totalTurns: z.number().int().nonnegative(),
  snapshotsCount: z.number().int().nonnegative(),
  timeline: z.array(TimelineTurnEntrySchema),
  bisectResult: BisectResultSchema.optional(),
  counterfactualBranches: z.array(CounterfactualBranchSchema),
  recommendations: z.array(z.string()),
  timestamp: z.string(),
});

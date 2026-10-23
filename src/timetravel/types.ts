import { Trajectory, ToolCall, ToolCallResult } from "../core/types.js";

export interface VirtualFile {
  path: string;
  content: string;
  hash: string;
  size: number;
  lastModifiedTurn: number;
}

export type VirtualFSState = Record<string, VirtualFile>;

export type FileDeltaType = "created" | "modified" | "deleted" | "unchanged";

export interface FileDelta {
  path: string;
  type: FileDeltaType;
  oldHash?: string;
  newHash?: string;
  oldContent?: string;
  newContent?: string;
  patchPreview?: string;
}

export interface TurnSnapshot {
  turnNumber: number;
  timestamp: string;
  virtualFs: VirtualFSState;
  env: Record<string, string>;
  toolCalls: ToolCall[];
  cumulativeTokens: number;
  turnDurationMs: number;
  fileDeltas: FileDelta[];
  metadata?: Record<string, unknown>;
}

export type BreakpointConditionType =
  | "turn"
  | "tool"
  | "exit-code"
  | "error-pattern"
  | "file-changed"
  | "custom";

export interface BreakpointCondition {
  type: BreakpointConditionType;
  turnNumber?: number;
  toolName?: string;
  exitCode?: number;
  pattern?: string;
  filePath?: string;
  predicate?: (snapshot: TurnSnapshot) => boolean;
}

export interface Breakpoint {
  id: string;
  name?: string;
  enabled: boolean;
  condition: BreakpointCondition;
  hitCount: number;
  action?: "pause" | "log";
}

export type WatchpointTriggerType = "create" | "modify" | "delete" | "any";

export interface Watchpoint {
  id: string;
  path: string;
  triggerOn: WatchpointTriggerType;
  enabled: boolean;
  hitCount: number;
}

export type BuiltinPredicateType =
  | "exit-code-success"
  | "file-exists"
  | "file-contains"
  | "no-error-output"
  | "custom";

export interface BisectEvaluationStep {
  turnNumber: number;
  passed: boolean;
  reason?: string;
  snapshotSnippet?: string;
}

export interface BisectResult {
  firstFaultyTurn: number | null;
  faultyToolCall?: ToolCall;
  stepsEvaluated: number;
  evaluations: BisectEvaluationStep[];
  rootCauseDescription: string;
  confidence: number; // 0.0 - 1.0
  durationMs: number;
}

export type MutationType =
  | "override-tool-result"
  | "patch-file"
  | "delete-file"
  | "inject-prompt"
  | "modify-arguments";

export interface CounterfactualMutation {
  type: MutationType;
  targetCallId?: string;
  targetTool?: string;
  mockResult?: Partial<ToolCallResult>;
  filePath?: string;
  fileContent?: string;
  injectedPrompt?: string;
  modifiedArgs?: Record<string, unknown>;
  description?: string;
}

export interface BranchOutcomeDelta {
  originalCompleted: boolean;
  branchCompleted: boolean;
  originalTurns: number;
  branchTurns: number;
  originalTokens: number;
  branchTokens: number;
  divergenceTurn: number;
  turnReduction: number;
  statusChange: "rescued" | "worsened" | "neutral" | "identical";
}

export interface CounterfactualBranch {
  branchId: string;
  branchName: string;
  forkTurn: number;
  mutations: CounterfactualMutation[];
  replayedTrajectory: Trajectory;
  divergedFromBaseline: boolean;
  divergenceTurn?: number;
  outcomeDelta: BranchOutcomeDelta;
  createdAt: string;
}

export type TimeTravelReportFormat = "terminal" | "markdown" | "json";

export interface TimelineTurnEntry {
  turnNumber: number;
  toolNames: string[];
  exitCodes: number[];
  deltasCount: number;
  status: "success" | "failure" | "warning";
  hitBreakpointIds?: string[];
}

export interface TimeTravelReport {
  scenarioId: string;
  totalTurns: number;
  snapshotsCount: number;
  timeline: TimelineTurnEntry[];
  bisectResult?: BisectResult;
  counterfactualBranches: CounterfactualBranch[];
  recommendations: string[];
  timestamp: string;
}

export interface TimeTravelSessionOptions {
  initialFiles?: Record<string, string>;
  initialEnv?: Record<string, string>;
  enableDeltaCompression?: boolean;
  maxCachedSnapshots?: number;
}

export interface BisectOptions {
  lowTurn?: number;
  highTurn?: number;
  predicateType?: BuiltinPredicateType;
  predicateArg?: string;
  customPredicate?: (snapshot: TurnSnapshot, turnIndex: number) => boolean | Promise<boolean>;
}

export interface CounterfactualOptions {
  branchName?: string;
  forkTurn: number;
  mutations: CounterfactualMutation[];
  continuationTurns?: number;
  mockDispatcher?: (
    toolName: string,
    args: Record<string, unknown>,
    turn: number
  ) => Promise<ToolCallResult> | ToolCallResult;
}

export interface StepResult {
  currentTurn: number;
  snapshot: TurnSnapshot;
  hitBreakpoints: Breakpoint[];
  hitWatchpoints: Watchpoint[];
  isEnd: boolean;
  isStart: boolean;
}

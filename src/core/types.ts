import { z } from 'zod';
import {
  BudgetsSchema,
  SecurityPolicySchema,
  WorkspaceConfigSchema,
  TaskConfigSchema,
  FileAssertionSchema,
  CommandAssertionSchema,
  TrajectoryAssertionSchema,
  TrajectoryAssertionRuleSchema,
  ScenarioAssertionsSchema,
  ScenarioDefinitionSchema,
  ToolCallSchema,
  ToolCallResultSchema,
  AgentTurnSchema,
  TrajectorySummarySchema,
  TrajectorySchema,
  AssertionItemResultSchema,
  HarnessReportSchema,
} from './schemas.js';

export type Budgets = z.infer<typeof BudgetsSchema>;
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;
export type TaskConfig = z.infer<typeof TaskConfigSchema>;
export type FileAssertion = z.infer<typeof FileAssertionSchema>;
export type CommandAssertion = z.infer<typeof CommandAssertionSchema>;
export type TrajectoryAssertion = z.infer<typeof TrajectoryAssertionSchema>;
export type TrajectoryAssertionRule = z.infer<typeof TrajectoryAssertionRuleSchema>;
export type ScenarioAssertions = z.infer<typeof ScenarioAssertionsSchema>;
export type ScenarioDefinition = z.infer<typeof ScenarioDefinitionSchema>;

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;
export type AgentTurn = z.infer<typeof AgentTurnSchema>;
export type TrajectorySummary = z.infer<typeof TrajectorySummarySchema>;
export type Trajectory = z.infer<typeof TrajectorySchema>;

export type AssertionItemResult = z.infer<typeof AssertionItemResultSchema>;
export type HarnessReport = z.infer<typeof HarnessReportSchema>;

/**
 * Agent interface to plug into the harness
 */
export interface AgentAdapter {
  name: string;
  version?: string;
  run(context: AgentRunContext): Promise<AgentRunResult>;
}

export interface AgentRunContext {
  scenario: ScenarioDefinition;
  workspacePath: string;
  signal: AbortSignal;
  executeCommand(command: string, timeoutMs?: number): Promise<ToolCallResult>;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  recordTurn(turn: Omit<AgentTurn, 'turnNumber'>): void;
}

export interface AgentRunResult {
  completed: boolean;
  message?: string;
  error?: string;
}

export type TrajectoryStatus = Trajectory['status'];

export type AssertionResult = AssertionItemResult;

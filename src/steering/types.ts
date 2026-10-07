import { ToolCallResult } from '../core/types.js';

export type BreakpointType = 'tool' | 'error_count' | 'turn' | 'budget_ratio' | 'custom';

export interface BreakpointEvaluationContext {
  scenarioId: string;
  turnNumber: number;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  consecutiveErrors: number;
  budgetRatio?: number;
  metadata?: Record<string, unknown>;
}

export interface BreakpointRule {
  id: string;
  name?: string;
  type: BreakpointType;
  enabled?: boolean;
  once?: boolean;
  hitCount?: number;
  toolPattern?: string;
  argumentMatch?: Record<string, string | number | boolean>;
  errorThreshold?: number;
  turnThreshold?: number;
  budgetRatioThreshold?: number;
  predicate?: (context: BreakpointEvaluationContext) => boolean | Promise<boolean>;
}

export interface BreakpointHitInfo {
  breakpoint: BreakpointRule;
  context: BreakpointEvaluationContext;
  timestamp: string;
  reason: string;
}

export type InterventionActionType =
  | 'continue'
  | 'inject_prompt'
  | 'override_tool'
  | 'skip_tool'
  | 'abort';

export interface InterventionAction {
  type: InterventionActionType;
  prompt?: string;
  overrideResult?: ToolCallResult;
  reason?: string;
  timestamp?: string;
}

export type SteeringStatus = 'idle' | 'running' | 'paused' | 'resumed' | 'aborted';

export interface SteeringState {
  status: SteeringStatus;
  isPaused: boolean;
  activeBreakpointHit?: BreakpointHitInfo;
  pendingIntervention?: InterventionAction;
  history: Array<{ hit: BreakpointHitInfo; action: InterventionAction }>;
  injectedPrompts: string[];
  breakpoints: BreakpointRule[];
}

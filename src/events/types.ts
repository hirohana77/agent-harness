import { ToolCallResult, TrajectoryStatus, HarnessReport } from '../core/types.js';
import { BreakpointHitInfo, InterventionAction } from '../steering/types.js';

export type TrajectoryEventType =
  | 'scenario:start'
  | 'scenario:complete'
  | 'turn:start'
  | 'turn:complete'
  | 'tool:start'
  | 'tool:end'
  | 'budget:warning'
  | 'status:change'
  | 'error'
  | 'sandbox:ready'
  | 'sandbox:teardown'
  | 'breakpoint:hit'
  | 'breakpoint:resume'
  | 'steering:action'
  | 'custom';

export interface BaseTrajectoryEvent {
  id: string;
  type: TrajectoryEventType;
  scenarioId: string;
  timestamp: string;
}

export interface ScenarioStartEvent extends BaseTrajectoryEvent {
  type: 'scenario:start';
  scenarioName?: string;
}

export interface ScenarioCompleteEvent extends BaseTrajectoryEvent {
  type: 'scenario:complete';
  status: TrajectoryStatus;
  passed: boolean;
  durationMs: number;
  report?: HarnessReport;
}

export interface TurnStartEvent extends BaseTrajectoryEvent {
  type: 'turn:start';
  turnNumber: number;
  prompt: string;
  thought?: string;
}

export interface TurnCompleteEvent extends BaseTrajectoryEvent {
  type: 'turn:complete';
  turnNumber: number;
  assistantMessage?: string;
  tokensUsed?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cumulativeTokens: number;
}

export interface ToolStartEvent extends BaseTrajectoryEvent {
  type: 'tool:start';
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  turnNumber: number;
}

export interface ToolEndEvent extends BaseTrajectoryEvent {
  type: 'tool:end';
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: ToolCallResult;
  durationMs: number;
  turnNumber: number;
}

export interface BudgetWarningEvent extends BaseTrajectoryEvent {
  type: 'budget:warning';
  budgetType: 'turns' | 'tokens' | 'timeout';
  usage: number;
  limit: number;
  ratio: number;
  message: string;
}

export interface StatusChangeEvent extends BaseTrajectoryEvent {
  type: 'status:change';
  previousStatus: TrajectoryStatus;
  newStatus: TrajectoryStatus;
  reason?: string;
}

export interface ErrorEvent extends BaseTrajectoryEvent {
  type: 'error';
  errorMessage: string;
  phase: string;
  errorName?: string;
  turnNumber?: number;
  stack?: string;
}

export interface SandboxReadyEvent extends BaseTrajectoryEvent {
  type: 'sandbox:ready';
  backend: 'local' | 'docker' | 'podman';
  containerId?: string;
  image?: string;
}

export interface SandboxTeardownEvent extends BaseTrajectoryEvent {
  type: 'sandbox:teardown';
  backend: 'local' | 'docker' | 'podman';
  containerId?: string;
  durationMs?: number;
}

export interface BreakpointHitEvent extends BaseTrajectoryEvent {
  type: 'breakpoint:hit';
  hit: BreakpointHitInfo;
}

export interface BreakpointResumeEvent extends BaseTrajectoryEvent {
  type: 'breakpoint:resume';
  action: InterventionAction;
}

export interface SteeringActionEvent extends BaseTrajectoryEvent {
  type: 'steering:action';
  action: InterventionAction;
}

export interface CustomEvent extends BaseTrajectoryEvent {
  type: 'custom';
  eventName: string;
  payload: unknown;
}

export type TrajectoryEvent =
  | ScenarioStartEvent
  | ScenarioCompleteEvent
  | TurnStartEvent
  | TurnCompleteEvent
  | ToolStartEvent
  | ToolEndEvent
  | BudgetWarningEvent
  | StatusChangeEvent
  | ErrorEvent
  | SandboxReadyEvent
  | SandboxTeardownEvent
  | BreakpointHitEvent
  | BreakpointResumeEvent
  | SteeringActionEvent
  | CustomEvent;

export type EventPattern = TrajectoryEventType | `${string}:*` | '*';

export type TrajectoryEventListener<T extends TrajectoryEvent = TrajectoryEvent> = (
  event: T
) => void | Promise<void>;

export type EventUnsubscribe = () => void;

export interface TrajectoryStreamObserver {
  name: string;
  onEvent(event: TrajectoryEvent): void | Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

export interface HarnessRunOptions {
  eventBus?: any; // TrajectoryEventBus
  observers?: TrajectoryStreamObserver[];
}

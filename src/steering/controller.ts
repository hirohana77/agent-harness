import { ToolCallResult } from '../core/types.js';
import { TrajectoryEventBus } from '../events/bus.js';
import { BreakpointEngine } from './engine.js';
import {
  BreakpointEvaluationContext,
  BreakpointHitInfo,
  BreakpointRule,
  InterventionAction,
  InterventionActionType,
  SteeringState,
  SteeringStatus,
} from './types.js';

export class SteeringAbortError extends Error {
  public reason?: string;
  constructor(message = 'Execution aborted by steering intervention', reason?: string) {
    super(message);
    this.name = 'SteeringAbortError';
    this.reason = reason;
  }
}

export interface SteeringControllerOptions {
  engine?: BreakpointEngine;
  eventBus?: TrajectoryEventBus;
  scenarioId?: string;
}

export interface InterventionDecision {
  action: InterventionActionType;
  overrideResult?: ToolCallResult;
  shouldExecuteNative: boolean;
  skipResult?: ToolCallResult;
  injectedPrompt?: string;
}

export class SteeringController {
  private engine: BreakpointEngine;
  private eventBus?: TrajectoryEventBus;
  private scenarioId: string;
  private status: SteeringStatus = 'idle';
  private isPaused = false;
  private activeBreakpointHit?: BreakpointHitInfo;
  private pendingIntervention?: InterventionAction;
  private history: Array<{ hit: BreakpointHitInfo; action: InterventionAction }> = [];
  private injectedPrompts: string[] = [];

  private turnNumber = 1;
  private consecutiveErrors = 0;
  private budgetRatio = 0;

  // Deferred promise resolvers for execution suspension
  private pendingWaitPromise: Promise<InterventionAction> | null = null;
  private pendingWaitResolver: ((action: InterventionAction) => void) | null = null;

  constructor(options?: SteeringControllerOptions) {
    this.engine = options?.engine ?? new BreakpointEngine();
    this.eventBus = options?.eventBus;
    this.scenarioId = options?.scenarioId ?? 'default';
  }

  public setEventBus(eventBus: TrajectoryEventBus): void {
    this.eventBus = eventBus;
  }

  public setScenarioId(scenarioId: string): void {
    this.scenarioId = scenarioId;
  }

  public getEngine(): BreakpointEngine {
    return this.engine;
  }

  public addBreakpoint(rule: BreakpointRule): BreakpointRule {
    return this.engine.addBreakpoint(rule);
  }

  public removeBreakpoint(id: string): boolean {
    return this.engine.removeBreakpoint(id);
  }

  public getBreakpoints(): BreakpointRule[] {
    return this.engine.getBreakpoints();
  }

  public clearBreakpoints(): void {
    this.engine.clearBreakpoints();
  }

  public start(): void {
    this.status = 'running';
    this.isPaused = false;
  }

  public pause(reason = 'Manual pause requested'): void {
    this.isPaused = true;
    this.status = 'paused';
    const fakeBreakpoint: BreakpointRule = {
      id: `manual_pause_${Date.now()}`,
      name: 'Manual Pause',
      type: 'custom',
    };
    this.activeBreakpointHit = {
      breakpoint: fakeBreakpoint,
      context: this.buildEvaluationContext(),
      timestamp: new Date().toISOString(),
      reason,
    };

    this.eventBus?.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'breakpoint:hit',
      scenarioId: this.scenarioId,
      timestamp: new Date().toISOString(),
      hit: this.activeBreakpointHit,
    });
  }

  public resume(action?: Partial<InterventionAction>): void {
    const defaultAction: InterventionAction = {
      type: 'continue',
      timestamp: new Date().toISOString(),
      ...action,
    };
    this.intervene(defaultAction);
  }

  public intervene(action: InterventionAction): void {
    const normalizedAction: InterventionAction = {
      ...action,
      timestamp: action.timestamp || new Date().toISOString(),
    };

    if (action.prompt) {
      this.injectPrompt(action.prompt);
    }

    if (this.pendingWaitResolver) {
      const resolver = this.pendingWaitResolver;
      this.pendingWaitResolver = null;
      this.pendingWaitPromise = null;
      resolver(normalizedAction);
    } else {
      this.pendingIntervention = normalizedAction;
      this.isPaused = false;
      this.status = normalizedAction.type === 'abort' ? 'aborted' : 'resumed';
    }
  }

  public injectPrompt(prompt: string): void {
    if (prompt && prompt.trim()) {
      this.injectedPrompts.push(prompt.trim());
    }
  }

  public getInjectedPrompts(): string[] {
    return [...this.injectedPrompts];
  }

  public consumeInjectedPrompts(): string[] {
    const consumed = [...this.injectedPrompts];
    this.injectedPrompts = [];
    return consumed;
  }

  public updateTurn(turn: number): void {
    this.turnNumber = turn;
  }

  public updateBudgetRatio(ratio: number): void {
    this.budgetRatio = ratio;
  }

  public recordSuccess(): void {
    this.consecutiveErrors = 0;
  }

  public recordError(): void {
    this.consecutiveErrors += 1;
  }

  public buildEvaluationContext(
    toolName?: string,
    toolArgs?: Record<string, unknown>,
    extra?: Partial<BreakpointEvaluationContext>
  ): BreakpointEvaluationContext {
    return {
      scenarioId: this.scenarioId,
      turnNumber: this.turnNumber,
      toolName,
      toolArgs,
      consecutiveErrors: this.consecutiveErrors,
      budgetRatio: this.budgetRatio,
      ...extra,
    };
  }

  public async interceptTool(
    toolName: string,
    args: Record<string, unknown>,
    extra?: Partial<BreakpointEvaluationContext>
  ): Promise<InterventionDecision> {
    if (this.status === 'idle') {
      this.status = 'running';
    }

    const context = this.buildEvaluationContext(toolName, args, extra);

    let hit = this.activeBreakpointHit;
    if (!this.isPaused) {
      const matchedRule = await this.engine.evaluate(context);
      if (matchedRule) {
        this.isPaused = true;
        this.status = 'paused';
        hit = {
          breakpoint: matchedRule,
          context,
          timestamp: new Date().toISOString(),
          reason: `Breakpoint triggered: ${matchedRule.name || matchedRule.type} (${matchedRule.id})`,
        };
        this.activeBreakpointHit = hit;

        this.eventBus?.emit({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'breakpoint:hit',
          scenarioId: this.scenarioId,
          timestamp: new Date().toISOString(),
          hit,
        });
      }
    }

    if (this.isPaused && hit) {
      const action = await this.waitForIntervention();
      this.history.push({ hit, action });

      this.eventBus?.emit({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'breakpoint:resume',
        scenarioId: this.scenarioId,
        timestamp: new Date().toISOString(),
        action,
      });

      this.eventBus?.emit({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'steering:action',
        scenarioId: this.scenarioId,
        timestamp: new Date().toISOString(),
        action,
      });

      this.activeBreakpointHit = undefined;
      this.isPaused = false;
      this.status = action.type === 'abort' ? 'aborted' : 'running';

      if (action.type === 'abort') {
        throw new SteeringAbortError(
          action.reason || `Execution aborted at tool "${toolName}"`,
          action.reason
        );
      }

      if (action.type === 'override_tool') {
        const defaultOverride: ToolCallResult = {
          success: true,
          output: `Mock override output for ${toolName}`,
          exitCode: 0,
        };
        return {
          action: 'override_tool',
          overrideResult: action.overrideResult || defaultOverride,
          shouldExecuteNative: false,
          injectedPrompt: action.prompt,
        };
      }

      if (action.type === 'skip_tool') {
        return {
          action: 'skip_tool',
          skipResult: action.overrideResult || {
            success: true,
            output: `Tool "${toolName}" skipped by steering intervention`,
            exitCode: 0,
          },
          shouldExecuteNative: false,
          injectedPrompt: action.prompt,
        };
      }

      return {
        action: action.type,
        shouldExecuteNative: true,
        injectedPrompt: action.prompt,
      };
    }

    return {
      action: 'continue',
      shouldExecuteNative: true,
    };
  }

  private waitForIntervention(): Promise<InterventionAction> {
    if (this.pendingIntervention) {
      const action = this.pendingIntervention;
      this.pendingIntervention = undefined;
      return Promise.resolve(action);
    }

    if (!this.pendingWaitPromise) {
      this.pendingWaitPromise = new Promise<InterventionAction>((resolve) => {
        this.pendingWaitResolver = resolve;
      });
    }

    return this.pendingWaitPromise;
  }

  public getState(): SteeringState {
    return {
      status: this.status,
      isPaused: this.isPaused,
      activeBreakpointHit: this.activeBreakpointHit,
      pendingIntervention: this.pendingIntervention,
      history: [...this.history],
      injectedPrompts: [...this.injectedPrompts],
      breakpoints: this.engine.getBreakpoints(),
    };
  }

  public reset(): void {
    this.status = 'idle';
    this.isPaused = false;
    this.activeBreakpointHit = undefined;
    this.pendingIntervention = undefined;
    this.history = [];
    this.injectedPrompts = [];
    this.turnNumber = 1;
    this.consecutiveErrors = 0;
    this.budgetRatio = 0;
    this.pendingWaitResolver = null;
    this.pendingWaitPromise = null;
  }
}

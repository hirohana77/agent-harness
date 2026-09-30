import {
  AgentTurn,
  Budgets,
  ToolCall,
  ToolCallResult,
  Trajectory,
  TrajectoryStatus,
} from '../core/types.js';
import { BudgetExceededError } from '../core/errors.js';
import { TrajectoryEventBus } from '../events/bus.js';

export class TrajectoryRecorder {
  private scenarioId: string;
  private budgets?: Budgets;
  private startedAt: number;
  private trajectory: Trajectory;
  private currentTurn: AgentTurn | null = null;
  private eventBus?: TrajectoryEventBus;

  constructor(scenarioId: string, budgets?: Budgets, eventBus?: TrajectoryEventBus) {
    this.scenarioId = scenarioId;
    this.budgets = budgets;
    this.startedAt = Date.now();
    this.eventBus = eventBus;

    this.trajectory = {
      scenarioId,
      startedAt: new Date(this.startedAt).toISOString(),
      status: 'running',
      durationMs: 0,
      turns: [],
      summary: {
        totalTurns: 0,
        totalToolCalls: 0,
        totalTokens: 0,
        costUsd: 0,
        completed: false,
      },
    };
  }

  public getEventBus(): TrajectoryEventBus | undefined {
    return this.eventBus;
  }

  public setEventBus(eventBus: TrajectoryEventBus): void {
    this.eventBus = eventBus;
  }

  /**
   * Start a new agent turn
   */
  public startTurn(prompt: string, thought?: string): AgentTurn {
    this.assertBudget();

    const turnNumber = this.trajectory.turns.length + 1;
    if (this.budgets?.maxTurns && turnNumber > this.budgets.maxTurns) {
      const prev = this.trajectory.status;
      this.trajectory.status = 'budget_exceeded';
      this.emitStatusChange(prev, 'budget_exceeded', 'Turn budget limit exceeded');
      throw new BudgetExceededError(
        `Turn budget exceeded: maximum allowed turns is ${this.budgets.maxTurns}`,
        { maxTurns: this.budgets.maxTurns, currentTurn: turnNumber }
      );
    }

    this.currentTurn = {
      turnNumber,
      prompt,
      thought,
      toolCalls: [],
      tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };

    this.eventBus?.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'turn:start',
      scenarioId: this.scenarioId,
      timestamp: new Date().toISOString(),
      turnNumber,
      prompt,
      thought,
    });

    if (this.budgets?.maxTurns) {
      const ratio = turnNumber / this.budgets.maxTurns;
      if (ratio >= 0.8) {
        this.eventBus?.emit({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'budget:warning',
          scenarioId: this.scenarioId,
          timestamp: new Date().toISOString(),
          budgetType: 'turns',
          usage: turnNumber,
          limit: this.budgets.maxTurns,
          ratio,
          message: `Turn count (${turnNumber}/${this.budgets.maxTurns}) reached ${Math.round(ratio * 100)}% of budget`,
        });
      }
    }

    return this.currentTurn;
  }

  /**
   * Notify that a tool call has started
   */
  public notifyToolStart(toolName: string, args: Record<string, unknown>, callId?: string): string {
    const activeCallId = callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.eventBus?.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'tool:start',
      scenarioId: this.scenarioId,
      timestamp: new Date().toISOString(),
      callId: activeCallId,
      toolName,
      arguments: args,
      turnNumber: this.currentTurn?.turnNumber ?? 0,
    });
    return activeCallId;
  }

  /**
   * Record a tool execution within the active turn
   */
  public recordToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result?: ToolCallResult,
    durationMs = 0
  ): ToolCall {
    if (!this.currentTurn) {
      throw new Error('Cannot record tool call without an active turn. Call startTurn() first.');
    }

    const toolCall: ToolCall = {
      callId: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      toolName,
      arguments: args,
      result,
      durationMs,
    };

    this.currentTurn.toolCalls.push(toolCall);
    this.trajectory.summary.totalToolCalls += 1;

    this.eventBus?.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'tool:end',
      scenarioId: this.scenarioId,
      timestamp: new Date().toISOString(),
      callId: toolCall.callId,
      toolName,
      arguments: args,
      result,
      durationMs,
      turnNumber: this.currentTurn.turnNumber,
    });

    return toolCall;
  }

  /**
   * Complete the active turn
   */
  public completeTurn(
    assistantMessage?: string,
    tokensUsed?: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): AgentTurn {
    if (!this.currentTurn) {
      throw new Error('No active turn to complete.');
    }

    this.currentTurn.assistantMessage = assistantMessage;

    if (tokensUsed) {
      this.currentTurn.tokensUsed = tokensUsed;
      this.trajectory.summary.totalTokens += tokensUsed.totalTokens;

      if (this.budgets?.maxTokens && this.trajectory.summary.totalTokens > this.budgets.maxTokens) {
        const prev = this.trajectory.status;
        this.trajectory.status = 'budget_exceeded';
        this.emitStatusChange(prev, 'budget_exceeded', 'Token budget exceeded');
        throw new BudgetExceededError(
          `Token budget exceeded: limit is ${this.budgets.maxTokens}, used ${this.trajectory.summary.totalTokens}`,
          { maxTokens: this.budgets.maxTokens, usedTokens: this.trajectory.summary.totalTokens }
        );
      }

      if (this.budgets?.maxTokens) {
        const ratio = this.trajectory.summary.totalTokens / this.budgets.maxTokens;
        if (ratio >= 0.8) {
          this.eventBus?.emit({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'budget:warning',
            scenarioId: this.scenarioId,
            timestamp: new Date().toISOString(),
            budgetType: 'tokens',
            usage: this.trajectory.summary.totalTokens,
            limit: this.budgets.maxTokens,
            ratio,
            message: `Token usage (${this.trajectory.summary.totalTokens}/${this.budgets.maxTokens}) reached ${Math.round(ratio * 100)}% of budget`,
          });
        }
      }
    }

    this.trajectory.turns.push(this.currentTurn);
    this.trajectory.summary.totalTurns = this.trajectory.turns.length;
    const completedTurn = this.currentTurn;
    this.currentTurn = null;

    this.eventBus?.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'turn:complete',
      scenarioId: this.scenarioId,
      timestamp: new Date().toISOString(),
      turnNumber: completedTurn.turnNumber,
      assistantMessage,
      tokensUsed,
      cumulativeTokens: this.trajectory.summary.totalTokens,
    });

    return completedTurn;
  }

  /**
   * Finalize the recording and compute metrics
   */
  public finalize(status: TrajectoryStatus = 'completed', costUsd = 0): Trajectory {
    const prev = this.trajectory.status;
    const endedAt = Date.now();
    this.trajectory.completedAt = new Date(endedAt).toISOString();
    this.trajectory.durationMs = endedAt - this.startedAt;
    this.trajectory.status = status;
    this.trajectory.summary.costUsd = costUsd;
    this.trajectory.summary.completed = status === 'completed';

    if (prev !== status) {
      this.emitStatusChange(prev, status, `Trajectory finalized with status: ${status}`);
    }

    return this.getTrajectory();
  }

  public getTrajectory(): Trajectory {
    return { ...this.trajectory };
  }

  private emitStatusChange(previousStatus: TrajectoryStatus, newStatus: TrajectoryStatus, reason?: string): void {
    this.eventBus?.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'status:change',
      scenarioId: this.scenarioId,
      timestamp: new Date().toISOString(),
      previousStatus,
      newStatus,
      reason,
    });
  }

  private assertBudget(): void {
    if (this.budgets?.timeoutMs) {
      const elapsed = Date.now() - this.startedAt;
      if (elapsed > this.budgets.timeoutMs) {
        const prev = this.trajectory.status;
        this.trajectory.status = 'timeout';
        this.emitStatusChange(prev, 'timeout', 'Execution timeout exceeded');
        throw new BudgetExceededError(
          `Execution timeout: elapsed ${elapsed}ms exceeds budget ${this.budgets.timeoutMs}ms`,
          { timeoutMs: this.budgets.timeoutMs, elapsedMs: elapsed }
        );
      }
    }
  }
}

import {
  AgentTurn,
  Budgets,
  ToolCall,
  ToolCallResult,
  Trajectory,
  TrajectoryStatus,
} from '../core/types.js';
import { BudgetExceededError } from '../core/errors.js';

export class TrajectoryRecorder {
  private scenarioId: string;
  private budgets?: Budgets;
  private startedAt: number;
  private trajectory: Trajectory;
  private currentTurn: AgentTurn | null = null;

  constructor(scenarioId: string, budgets?: Budgets) {
    this.scenarioId = scenarioId;
    this.budgets = budgets;
    this.startedAt = Date.now();

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

  /**
   * Start a new agent turn
   */
  public startTurn(prompt: string, thought?: string): AgentTurn {
    this.assertBudget();

    const turnNumber = this.trajectory.turns.length + 1;
    if (this.budgets?.maxTurns && turnNumber > this.budgets.maxTurns) {
      this.trajectory.status = 'budget_exceeded';
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

    return this.currentTurn;
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
        this.trajectory.status = 'budget_exceeded';
        throw new BudgetExceededError(
          `Token budget exceeded: limit is ${this.budgets.maxTokens}, used ${this.trajectory.summary.totalTokens}`,
          { maxTokens: this.budgets.maxTokens, usedTokens: this.trajectory.summary.totalTokens }
        );
      }
    }

    this.trajectory.turns.push(this.currentTurn);
    this.trajectory.summary.totalTurns = this.trajectory.turns.length;
    const completedTurn = this.currentTurn;
    this.currentTurn = null;

    return completedTurn;
  }

  /**
   * Finalize the recording and compute metrics
   */
  public finalize(status: TrajectoryStatus = 'completed', costUsd = 0): Trajectory {
    const endedAt = Date.now();
    this.trajectory.completedAt = new Date(endedAt).toISOString();
    this.trajectory.durationMs = endedAt - this.startedAt;
    this.trajectory.status = status;
    this.trajectory.summary.costUsd = costUsd;
    this.trajectory.summary.completed = status === 'completed';

    return this.getTrajectory();
  }

  public getTrajectory(): Trajectory {
    return { ...this.trajectory };
  }

  private assertBudget(): void {
    if (this.budgets?.timeoutMs) {
      const elapsed = Date.now() - this.startedAt;
      if (elapsed > this.budgets.timeoutMs) {
        this.trajectory.status = 'timeout';
        throw new BudgetExceededError(
          `Execution timeout: elapsed ${elapsed}ms exceeds budget ${this.budgets.timeoutMs}ms`,
          { timeoutMs: this.budgets.timeoutMs, elapsedMs: elapsed }
        );
      }
    }
  }
}

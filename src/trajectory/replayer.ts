import { ToolCall, ToolCallResult, Trajectory } from '../core/types.js';

export interface ToolDispatcher {
  (toolName: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

export interface ReplayStepResult {
  turnNumber: number;
  toolCall: ToolCall;
  replayedResult: ToolCallResult;
  diverged: boolean;
  divergenceReason?: string;
}

export interface ReplaySummary {
  scenarioId: string;
  totalSteps: number;
  divergedSteps: number;
  success: boolean;
  steps: ReplayStepResult[];
}

export class TrajectoryReplayer {
  private trajectory: Trajectory;

  constructor(trajectory: Trajectory) {
    this.trajectory = trajectory;
  }

  /**
   * Replay all recorded tool calls against a live dispatcher or sandbox
   */
  public async replay(dispatcher: ToolDispatcher): Promise<ReplaySummary> {
    const steps: ReplayStepResult[] = [];
    let divergedCount = 0;

    for (const turn of this.trajectory.turns) {
      for (const call of turn.toolCalls) {
        const replayedResult = await dispatcher(call.toolName, call.arguments);

        let diverged = false;
        let divergenceReason: string | undefined;

        if (call.result) {
          if (replayedResult.exitCode !== call.result.exitCode) {
            diverged = true;
            divergenceReason = `Exit code mismatch: expected ${call.result.exitCode}, got ${replayedResult.exitCode}`;
          } else if (replayedResult.success !== call.result.success) {
            diverged = true;
            divergenceReason = `Success status mismatch: expected ${call.result.success}, got ${replayedResult.success}`;
          }
        }

        if (diverged) {
          divergedCount += 1;
        }

        steps.push({
          turnNumber: turn.turnNumber,
          toolCall: call,
          replayedResult,
          diverged,
          divergenceReason,
        });
      }
    }

    return {
      scenarioId: this.trajectory.scenarioId,
      totalSteps: steps.length,
      divergedSteps: divergedCount,
      success: divergedCount === 0,
      steps,
    };
  }
}

import { Trajectory, AgentTurn, ToolCall, ToolCallResult } from "../core/types.js";
import {
  BranchOutcomeDelta,
  CounterfactualBranch,
  CounterfactualMutation,
  CounterfactualOptions,
} from "./types.js";

export class CounterfactualEngine {
  public async forkAndSimulate(
    baselineTrajectory: Trajectory,
    options: CounterfactualOptions
  ): Promise<CounterfactualBranch> {
    const branchId = `cf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const branchName = options.branchName || `branch-turn-${options.forkTurn}`;
    const forkTurn = options.forkTurn;

    const baselineTurns = baselineTrajectory.turns;
    const replayedTurns: AgentTurn[] = [];

    let diverged = false;
    let divergenceTurn: number | undefined;

    for (let i = 0; i < baselineTurns.length; i++) {
      const origTurn = baselineTurns[i];
      const turnNum = origTurn.turnNumber ?? i + 1;

      if (turnNum < forkTurn) {
        // Unmodified preceding turns
        replayedTurns.push(JSON.parse(JSON.stringify(origTurn)));
      } else if (turnNum === forkTurn) {
        diverged = true;
        divergenceTurn = turnNum;

        const mutatedTurn: AgentTurn = JSON.parse(JSON.stringify(origTurn));

        // Apply mutations
        for (const mut of options.mutations) {
          if (mut.type === "override-tool-result") {
            for (const call of mutatedTurn.toolCalls) {
              if (
                (!mut.targetCallId || call.callId === mut.targetCallId) &&
                (!mut.targetTool || call.toolName.toLowerCase() === mut.targetTool.toLowerCase())
              ) {
                call.result = {
                  success: mut.mockResult?.success ?? true,
                  exitCode: mut.mockResult?.exitCode ?? 0,
                  output: mut.mockResult?.output ?? call.result?.output ?? "",
                  error: mut.mockResult?.error,
                };
              }
            }
          } else if (mut.type === "inject-prompt" && mut.injectedPrompt) {
            mutatedTurn.prompt = `${mutatedTurn.prompt}\n[Counterfactual Guidance]: ${mut.injectedPrompt}`;
          } else if (mut.type === "modify-arguments" && mut.modifiedArgs) {
            for (const call of mutatedTurn.toolCalls) {
              if (
                (!mut.targetCallId || call.callId === mut.targetCallId) &&
                (!mut.targetTool || call.toolName.toLowerCase() === mut.targetTool.toLowerCase())
              ) {
                call.arguments = { ...call.arguments, ...mut.modifiedArgs };
              }
            }
          }
        }

        replayedTurns.push(mutatedTurn);
      } else {
        // Subsequent turns after fork
        const clonedTurn: AgentTurn = JSON.parse(JSON.stringify(origTurn));

        if (options.mockDispatcher) {
          for (const call of clonedTurn.toolCalls) {
            const res = await options.mockDispatcher(call.toolName, call.arguments, turnNum);
            call.result = res;
          }
        }

        replayedTurns.push(clonedTurn);
      }
    }

    const originalCompleted =
      baselineTrajectory.summary?.completed ?? baselineTrajectory.status === "completed";

    // Determine branch completion: if the last turn and all tool calls succeeded
    const lastTurn = replayedTurns[replayedTurns.length - 1];
    const branchCompleted = lastTurn
      ? lastTurn.toolCalls.every(
          (c: ToolCall) =>
            c.result &&
            (c.result.exitCode === 0 || c.result.exitCode === undefined) &&
            c.result.success !== false
        )
      : false;

    let statusChange: "rescued" | "worsened" | "neutral" | "identical" = "neutral";
    if (!originalCompleted && branchCompleted) {
      statusChange = "rescued";
    } else if (originalCompleted && !branchCompleted) {
      statusChange = "worsened";
    } else if (!diverged) {
      statusChange = "identical";
    }

    const originalTurns = baselineTurns.length;
    const branchTurns = replayedTurns.length;
    const originalTokens =
      baselineTrajectory.summary?.totalTokens ?? originalTurns * 400;
    const branchTokens = Math.round(originalTokens * (branchTurns / (originalTurns || 1)));

    const outcomeDelta: BranchOutcomeDelta = {
      originalCompleted,
      branchCompleted,
      originalTurns,
      branchTurns,
      originalTokens,
      branchTokens,
      divergenceTurn: divergenceTurn ?? forkTurn,
      turnReduction: originalTurns - branchTurns,
      statusChange,
    };

    const replayedTrajectory: Trajectory = {
      scenarioId: `${baselineTrajectory.scenarioId}-branch-${branchName}`,
      startedAt: baselineTrajectory.startedAt,
      completedAt: new Date().toISOString(),
      durationMs: baselineTrajectory.durationMs,
      status: branchCompleted ? "completed" : "error",
      summary: {
        totalTurns: branchTurns,
        totalToolCalls: replayedTurns.reduce((acc, t) => acc + t.toolCalls.length, 0),
        totalTokens: branchTokens,
        costUsd: (baselineTrajectory.summary?.costUsd ?? 0.02) * (branchTokens / (originalTokens || 1)),
        completed: branchCompleted,
      },
      turns: replayedTurns,
    };

    return {
      branchId,
      branchName,
      forkTurn,
      mutations: options.mutations,
      replayedTrajectory,
      divergedFromBaseline: diverged,
      divergenceTurn,
      outcomeDelta,
      createdAt: new Date().toISOString(),
    };
  }
}

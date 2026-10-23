import { describe, expect, it } from "vitest";
import { Trajectory } from "../../src/core/types.js";
import { CounterfactualEngine } from "../../src/timetravel/counterfactual.js";

describe("CounterfactualEngine", () => {
  const failingTrajectory: Trajectory = {
    scenarioId: "cf-test-scenario",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: {
      totalTurns: 3,
      totalToolCalls: 3,
      totalTokens: 1200,
      costUsd: 0.02,
      completed: false,
    },
    turns: [
      {
        turnNumber: 1,
        prompt: "First step",
        toolCalls: [
          {
            callId: "c1",
            toolName: "bash",
            arguments: { command: "npm install" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Second step failing",
        toolCalls: [
          {
            callId: "c2",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, output: "AssertionError" },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Third step aborted",
        toolCalls: [
          {
            callId: "c3",
            toolName: "bash",
            arguments: { command: "echo failure" },
            result: { success: false, exitCode: 1 },
          },
        ],
      },
    ],
  };

  it("forks branch and applies override-tool-result mutation", async () => {
    const engine = new CounterfactualEngine();
    const branch = await engine.forkAndSimulate(failingTrajectory, {
      branchName: "override-test-pass",
      forkTurn: 2,
      mutations: [
        {
          type: "override-tool-result",
          targetCallId: "c2",
          mockResult: {
            success: true,
            exitCode: 0,
            output: "PASS 1 test passed",
          },
        },
      ],
      mockDispatcher: async (tool, args, turn) => {
        if (turn === 3) {
          return { success: true, exitCode: 0, output: "recovered" };
        }
        return { success: true, exitCode: 0 };
      },
    });

    expect(branch.divergedFromBaseline).toBe(true);
    expect(branch.divergenceTurn).toBe(2);
    expect(branch.outcomeDelta.statusChange).toBe("rescued");
    expect(branch.replayedTrajectory.turns[1].toolCalls[0].result?.exitCode).toBe(0);
    expect(branch.replayedTrajectory.turns[2].toolCalls[0].result?.exitCode).toBe(0);
    expect(branch.replayedTrajectory.status).toBe("completed");
  });

  it("applies inject-prompt and modify-arguments mutations", async () => {
    const engine = new CounterfactualEngine();
    const branch = await engine.forkAndSimulate(failingTrajectory, {
      branchName: "steer-prompt",
      forkTurn: 2,
      mutations: [
        {
          type: "inject-prompt",
          injectedPrompt: "Use vitest instead of jest",
        },
        {
          type: "modify-arguments",
          targetTool: "bash",
          modifiedArgs: { command: "npx vitest run" },
        },
      ],
    });

    const turn2 = branch.replayedTrajectory.turns[1];
    expect(turn2.prompt).toContain("[Counterfactual Guidance]: Use vitest instead of jest");
    expect(turn2.toolCalls[0].arguments.command).toBe("npx vitest run");
  });
});

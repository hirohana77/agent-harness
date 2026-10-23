import { describe, expect, it } from "vitest";
import { Trajectory } from "../../src/core/types.js";
import { TimeTravelEngine } from "../../src/timetravel/engine.js";

describe("TimeTravelEngine Integration", () => {
  const sampleTrajectory: Trajectory = {
    scenarioId: "engine-test-traj",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: {
      totalTurns: 4,
      totalToolCalls: 4,
      totalTokens: 1600,
      costUsd: 0.02,
      completed: false,
    },
    turns: [
      {
        turnNumber: 1,
        prompt: "Setup workspace",
        toolCalls: [
          {
            callId: "c1",
            toolName: "file_write",
            arguments: { path: "src/server.ts", content: "export const port = 3000;" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Start server test",
        toolCalls: [
          {
            callId: "c2",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: true, exitCode: 0, output: "PASS" },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Accidental crash",
        toolCalls: [
          {
            callId: "c3",
            toolName: "bash",
            arguments: { command: "node invalid-script.js" },
            result: { success: false, exitCode: 1, error: "Cannot find module" },
          },
        ],
      },
      {
        turnNumber: 4,
        prompt: "Failure state",
        toolCalls: [
          {
            callId: "c4",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, error: "Test failed" },
          },
        ],
      },
    ],
  };

  it("creates interactive session and controls navigation", () => {
    const engine = new TimeTravelEngine();
    const { stepper, snapshotManager } = engine.createSession(sampleTrajectory);

    expect(stepper.getCurrentTurn()).toBe(1);
    expect(snapshotManager.getAllSnapshots().length).toBe(4);

    const stepRes = stepper.stepForward();
    expect(stepRes.currentTurn).toBe(2);
  });

  it("executes bisect through engine facade", async () => {
    const engine = new TimeTravelEngine();
    const bisectResult = await engine.bisect(sampleTrajectory);

    expect(bisectResult.firstFaultyTurn).toBe(3);
    expect(bisectResult.faultyToolCall?.toolName).toBe("bash");
    expect(bisectResult.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("generates comprehensive TimeTravelReport with recommendations", async () => {
    const engine = new TimeTravelEngine();

    const branch = await engine.forkBranch(sampleTrajectory, {
      branchName: "quick-fix",
      forkTurn: 3,
      mutations: [
        {
          type: "override-tool-result",
          targetCallId: "c3",
          mockResult: { success: true, exitCode: 0, output: "recovered" },
        },
      ],
      mockDispatcher: async () => ({ success: true, exitCode: 0 }),
    });

    const report = await engine.generateReport(sampleTrajectory, {
      runBisect: true,
      counterfactualBranches: [branch],
    });

    expect(report.scenarioId).toBe("engine-test-traj");
    expect(report.totalTurns).toBe(4);
    expect(report.timeline.length).toBe(4);
    expect(report.bisectResult?.firstFaultyTurn).toBe(3);
    expect(report.counterfactualBranches.length).toBe(1);
    expect(report.counterfactualBranches[0].outcomeDelta.statusChange).toBe("rescued");
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations.some((r) => r.includes("Turn 3"))).toBe(true);
  });
});

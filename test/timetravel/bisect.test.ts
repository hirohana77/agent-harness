import { describe, expect, it } from "vitest";
import { Trajectory } from "../../src/core/types.js";
import { TrajectoryBisector } from "../../src/timetravel/bisect.js";

describe("TrajectoryBisector", () => {
  const failingTrajectory: Trajectory = {
    scenarioId: "bisect-regression-scenario",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: {
      totalTurns: 6,
      totalToolCalls: 6,
      totalTokens: 2400,
      costUsd: 0.03,
      completed: false,
    },
    turns: [
      {
        turnNumber: 1,
        prompt: "Setup workspace",
        toolCalls: [
          {
            callId: "t1",
            toolName: "file_write",
            arguments: { path: "src/calc.ts", content: "export function add(a, b) { return a + b; }" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Run initial test",
        toolCalls: [
          {
            callId: "t2",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: true, exitCode: 0, output: "PASS calc.test.ts" },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Add helper utility",
        toolCalls: [
          {
            callId: "t3",
            toolName: "file_write",
            arguments: { path: "src/utils.ts", content: "export const VERSION = 1;" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 4,
        prompt: "Accidental faulty refactor",
        toolCalls: [
          {
            callId: "t4",
            toolName: "bash",
            arguments: { command: "echo 'syntax error ::::' >> src/calc.ts" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 5,
        prompt: "Run tests again - FAILS",
        toolCalls: [
          {
            callId: "t5",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, output: "FAIL SyntaxError: Unexpected token ':'" },
          },
        ],
      },
      {
        turnNumber: 6,
        prompt: "Retry without fixing - FAILS",
        toolCalls: [
          {
            callId: "t6",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, output: "FAIL SyntaxError: Unexpected token ':'" },
          },
        ],
      },
    ],
  };

  it("pinpoints exact failure turn using exit-code-success predicate", async () => {
    const bisector = new TrajectoryBisector(failingTrajectory);
    const result = await bisector.bisect({ predicateType: "exit-code-success" });

    expect(result.firstFaultyTurn).toBe(5);
    expect(result.stepsEvaluated).toBeGreaterThan(0);
    expect(result.stepsEvaluated).toBeLessThanOrEqual(5); // binary search efficiency
    expect(result.rootCauseDescription).toContain("Turn 5");
    expect(result.rootCauseDescription).toContain("exit code 1");
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("returns null when all turns pass", async () => {
    const passingTrajectory: Trajectory = {
      scenarioId: "passing-scenario",
      startedAt: "2026-10-24T03:00:00.000Z",
      status: "completed",
      turns: failingTrajectory.turns.slice(0, 3), // turns 1, 2, 3 all passed
    };

    const bisector = new TrajectoryBisector(passingTrajectory);
    const result = await bisector.bisect();

    expect(result.firstFaultyTurn).toBeNull();
    expect(result.confidence).toBe(1.0);
    expect(result.rootCauseDescription).toContain("No regression detected");
  });

  it("locates turn using file-contains predicate", async () => {
    const bisector = new TrajectoryBisector(failingTrajectory);

    // Turn 4 added 'syntax error' into src/calc.ts
    // Let's test predicate: src/calc.ts does NOT contain 'syntax error'
    const result = await bisector.bisect({
      customPredicate: (snap) => {
        const calc = snap.virtualFs["src/calc.ts"];
        return !calc || !calc.content.includes("syntax error");
      },
    });

    expect(result.firstFaultyTurn).toBe(4);
    expect(result.rootCauseDescription).toContain("Turn 4");
  });

  it("supports file-exists predicate", async () => {
    const bisector = new TrajectoryBisector(failingTrajectory);
    // Invert search: find where utils.ts exists
    const result = await bisector.bisect({
      predicateType: "file-exists",
      predicateArg: "src/utils.ts",
    });

    // Before turn 3, utils.ts did not exist. At turn 3 it existed.
    // Notice file-exists passes at turn 6, so high passes, returns null (no regression against file-exists)
    expect(result.firstFaultyTurn).toBeNull();
  });

  it("supports no-error-output predicate", async () => {
    const bisector = new TrajectoryBisector(failingTrajectory);
    const result = await bisector.bisect({ predicateType: "no-error-output" });

    expect(result.firstFaultyTurn).toBe(5);
  });
});

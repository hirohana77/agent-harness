import { describe, expect, it } from "vitest";
import { Trajectory } from "../../src/core/types.js";
import { SnapshotManager } from "../../src/timetravel/snapshot.js";
import { TimeTravelStepper } from "../../src/timetravel/stepper.js";

describe("TimeTravelStepper", () => {
  const sampleTrajectory: Trajectory = {
    scenarioId: "stepper-test",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "completed",
    summary: {
      totalTurns: 4,
      totalToolCalls: 4,
      totalTokens: 1600,
      costUsd: 0.02,
      completed: true,
    },
    turns: [
      {
        turnNumber: 1,
        prompt: "First turn",
        toolCalls: [
          {
            callId: "c1",
            toolName: "file_write",
            arguments: { path: "a.txt", content: "initial" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Second turn",
        toolCalls: [
          {
            callId: "c2",
            toolName: "bash",
            arguments: { command: "cat a.txt" },
            result: { success: true, exitCode: 0, output: "initial" },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Third turn with failure",
        toolCalls: [
          {
            callId: "c3",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, error: "SyntaxError: Unexpected token" },
          },
        ],
      },
      {
        turnNumber: 4,
        prompt: "Fourth turn recovery",
        toolCalls: [
          {
            callId: "c4",
            toolName: "file_write",
            arguments: { path: "a.txt", content: "fixed" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
    ],
  };

  it("navigates forward, backward, jump and reset", () => {
    const sm = new SnapshotManager(sampleTrajectory);
    const stepper = new TimeTravelStepper(sampleTrajectory, sm);

    expect(stepper.getCurrentTurn()).toBe(1);

    const step2 = stepper.stepForward();
    expect(step2.currentTurn).toBe(2);
    expect(step2.isEnd).toBe(false);
    expect(step2.isStart).toBe(false);

    const step4 = stepper.jumpToTurn(4);
    expect(step4.currentTurn).toBe(4);
    expect(step4.isEnd).toBe(true);

    const step3 = stepper.stepBackward();
    expect(step3.currentTurn).toBe(3);

    const resetStep = stepper.reset();
    expect(resetStep.currentTurn).toBe(1);
    expect(resetStep.isStart).toBe(true);
  });

  it("triggers turn breakpoint", () => {
    const sm = new SnapshotManager(sampleTrajectory);
    const stepper = new TimeTravelStepper(sampleTrajectory, sm);

    const bp = stepper.setBreakpoint({ type: "turn", turnNumber: 3 });
    expect(stepper.getBreakpoints().length).toBe(1);

    stepper.stepForward(); // turn 2
    expect(bp.hitCount).toBe(0);

    const res = stepper.stepForward(); // turn 3
    expect(res.hitBreakpoints.length).toBe(1);
    expect(res.hitBreakpoints[0].id).toBe(bp.id);
    expect(bp.hitCount).toBe(1);
  });

  it("triggers exit-code and error-pattern breakpoints", () => {
    const sm = new SnapshotManager(sampleTrajectory);
    const stepper = new TimeTravelStepper(sampleTrajectory, sm);

    const codeBp = stepper.setBreakpoint({ type: "exit-code", exitCode: 1 });
    const errBp = stepper.setBreakpoint({ type: "error-pattern", pattern: "SyntaxError" });

    stepper.jumpToTurn(3);
    expect(codeBp.hitCount).toBe(1);
    expect(errBp.hitCount).toBe(1);
  });

  it("triggers watchpoints on file modifications", () => {
    const sm = new SnapshotManager(sampleTrajectory);
    const stepper = new TimeTravelStepper(sampleTrajectory, sm);

    const wp = stepper.setWatchpoint("a.txt", "modify");
    expect(stepper.getWatchpoints().length).toBe(1);

    stepper.jumpToTurn(4); // turn 4 modified a.txt
    expect(wp.hitCount).toBe(1);

    stepper.removeWatchpoint(wp.id);
    expect(stepper.getWatchpoints().length).toBe(0);
  });

  it("runs until breakpoint in loop", () => {
    const sm = new SnapshotManager(sampleTrajectory);
    const stepper = new TimeTravelStepper(sampleTrajectory, sm);

    stepper.setBreakpoint({ type: "exit-code", exitCode: 1 });
    const res = stepper.runUntilBreakpoint();

    expect(res.currentTurn).toBe(3);
    expect(res.hitBreakpoints.length).toBe(1);
  });

  it("throws when jumping to out-of-range turn", () => {
    const sm = new SnapshotManager(sampleTrajectory);
    const stepper = new TimeTravelStepper(sampleTrajectory, sm);

    expect(() => stepper.jumpToTurn(99)).toThrow("Invalid turnNumber 99");
  });
});

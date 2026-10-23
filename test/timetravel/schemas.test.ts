import { describe, expect, it } from "vitest";
import {
  BreakpointConditionSchema,
  BreakpointSchema,
  WatchpointSchema,
  CounterfactualMutationSchema,
  CounterfactualBranchSchema,
  BisectResultSchema,
  TimeTravelReportSchema,
  VirtualFileSchema,
  FileDeltaSchema,
} from "../../src/timetravel/schemas.js";

describe("TimeTravel Zod Schemas", () => {
  it("validates VirtualFileSchema", () => {
    const validFile = {
      path: "src/index.ts",
      content: "console.log('hello');",
      hash: "a1b2c3d4",
      size: 21,
      lastModifiedTurn: 2,
    };
    expect(VirtualFileSchema.parse(validFile)).toEqual(validFile);

    expect(() =>
      VirtualFileSchema.parse({
        path: "src/index.ts",
        size: -1, // invalid negative
      })
    ).toThrow();
  });

  it("validates FileDeltaSchema", () => {
    const delta = {
      path: "config.json",
      type: "modified",
      oldHash: "111",
      newHash: "222",
      oldContent: '{"env":"dev"}',
      newContent: '{"env":"prod"}',
      patchPreview: "~ prod",
    };
    expect(FileDeltaSchema.parse(delta)).toEqual(delta);
  });

  it("validates BreakpointConditionSchema and BreakpointSchema", () => {
    const bp = {
      id: "bp-1",
      name: "Catch exit non-zero",
      enabled: true,
      condition: {
        type: "exit-code",
        exitCode: 1,
      },
      hitCount: 0,
      action: "pause",
    };
    expect(BreakpointSchema.parse(bp)).toEqual(bp);

    expect(() =>
      BreakpointConditionSchema.parse({
        type: "invalid-type",
      })
    ).toThrow();
  });

  it("validates WatchpointSchema", () => {
    const wp = {
      id: "wp-1",
      path: "package.json",
      triggerOn: "modify",
      enabled: true,
      hitCount: 3,
    };
    expect(WatchpointSchema.parse(wp)).toEqual(wp);
  });

  it("validates BisectResultSchema", () => {
    const bisect = {
      firstFaultyTurn: 4,
      stepsEvaluated: 3,
      evaluations: [
        { turnNumber: 5, passed: false, reason: "exit code 1" },
        { turnNumber: 2, passed: true, reason: "all exit codes 0" },
        { turnNumber: 4, passed: false, reason: "exit code 1" },
      ],
      rootCauseDescription: "Fault introduced in turn 4",
      confidence: 0.95,
      durationMs: 45,
    };
    expect(BisectResultSchema.parse(bisect)).toEqual(bisect);
  });

  it("validates CounterfactualBranchSchema", () => {
    const branch = {
      branchId: "cf-test-1",
      branchName: "override-success",
      forkTurn: 3,
      mutations: [
        {
          type: "override-tool-result",
          targetTool: "bash",
          mockResult: { success: true, exitCode: 0, output: "OK" },
        },
      ],
      divergedFromBaseline: true,
      divergenceTurn: 3,
      outcomeDelta: {
        originalCompleted: false,
        branchCompleted: true,
        originalTurns: 5,
        branchTurns: 5,
        originalTokens: 2000,
        branchTokens: 2000,
        divergenceTurn: 3,
        turnReduction: 0,
        statusChange: "rescued",
      },
      createdAt: "2026-10-24T03:00:00.000Z",
    };
    expect(CounterfactualBranchSchema.parse(branch)).toEqual(branch);
  });

  it("validates TimeTravelReportSchema", () => {
    const report = {
      scenarioId: "scenario-time-travel",
      totalTurns: 2,
      snapshotsCount: 2,
      timeline: [
        {
          turnNumber: 1,
          toolNames: ["bash"],
          exitCodes: [0],
          deltasCount: 1,
          status: "success",
        },
        {
          turnNumber: 2,
          toolNames: ["bash"],
          exitCodes: [1],
          deltasCount: 0,
          status: "failure",
        },
      ],
      counterfactualBranches: [],
      recommendations: ["Review turn 2"],
      timestamp: "2026-10-24T03:00:00.000Z",
    };
    expect(TimeTravelReportSchema.parse(report)).toEqual(report);
  });
});

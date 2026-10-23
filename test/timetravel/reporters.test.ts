import { describe, expect, it } from "vitest";
import { TimeTravelReport } from "../../src/timetravel/types.js";
import {
  renderTimeTravelReport,
  TerminalTimeTravelReporter,
  MarkdownTimeTravelReporter,
  JsonTimeTravelReporter,
} from "../../src/timetravel/reporters/index.js";

describe("TimeTravel Reporters", () => {
  const sampleReport: TimeTravelReport = {
    scenarioId: "test-scenario-reports",
    totalTurns: 3,
    snapshotsCount: 3,
    timeline: [
      {
        turnNumber: 1,
        toolNames: ["file_write"],
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
      {
        turnNumber: 3,
        toolNames: ["bash"],
        exitCodes: [0],
        deltasCount: 1,
        status: "success",
      },
    ],
    bisectResult: {
      firstFaultyTurn: 2,
      faultyToolCall: {
        toolName: "bash",
        arguments: { command: "npm test" },
        result: { success: false, exitCode: 1, output: "FAIL test/app.test.js" },
      },
      stepsEvaluated: 2,
      evaluations: [
        { turnNumber: 3, passed: true, reason: "exit 0" },
        { turnNumber: 2, passed: false, reason: "exit 1" },
      ],
      rootCauseDescription: "Turn 2 invoked 'bash' with exit code 1",
      confidence: 0.95,
      durationMs: 12,
    },
    counterfactualBranches: [
      {
        branchId: "cf-1",
        branchName: "quick-rescue",
        forkTurn: 2,
        mutations: [
          {
            type: "override-tool-result",
            mockResult: { success: true, exitCode: 0 },
          },
        ],
        replayedTrajectory: {
          scenarioId: "test-scenario-reports-branch-quick-rescue",
          startedAt: "2026-10-24T03:00:00.000Z",
          status: "completed",
          turns: [],
        },
        divergedFromBaseline: true,
        divergenceTurn: 2,
        outcomeDelta: {
          originalCompleted: false,
          branchCompleted: true,
          originalTurns: 3,
          branchTurns: 2,
          originalTokens: 1200,
          branchTokens: 800,
          divergenceTurn: 2,
          turnReduction: 1,
          statusChange: "rescued",
        },
        createdAt: "2026-10-24T03:00:00.000Z",
      },
    ],
    recommendations: [
      "Root-cause regression introduced at Turn 2.",
      "Counterfactual mutation at Turn 2 rescued execution.",
    ],
    timestamp: "2026-10-24T03:00:00.000Z",
  };

  it("renders terminal report containing key sections", () => {
    const rendered = TerminalTimeTravelReporter.render(sampleReport);

    expect(rendered).toContain("AGENT TIME-TRAVEL DEBUGGER & COUNTERFACTUAL REPORT");
    expect(rendered).toContain("test-scenario-reports");
    expect(rendered).toContain("Turn 2");
    expect(rendered).toContain("quick-rescue");
    expect(rendered).toContain("RESCUED");
    expect(rendered).toContain("Root-cause regression introduced at Turn 2");
  });

  it("renders markdown report with tables and badges", () => {
    const md = MarkdownTimeTravelReporter.render(sampleReport);

    expect(md).toContain("# ⏱ Agent Time-Travel Debugger & Counterfactual Report");
    expect(md).toContain("`test-scenario-reports`");
    expect(md).toContain("## 🔍 Bisect Root-Cause Attribution");
    expect(md).toContain("## 🔀 Counterfactual Branch Simulations");
    expect(md).toContain("## 📜 Trajectory Timeline");
    expect(md).toContain("**RESCUED ✔**");
  });

  it("renders valid json report matching source data", () => {
    const jsonStr = JsonTimeTravelReporter.render(sampleReport);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.scenarioId).toBe("test-scenario-reports");
    expect(parsed.bisectResult.firstFaultyTurn).toBe(2);
    expect(parsed.counterfactualBranches[0].branchName).toBe("quick-rescue");
  });

  it("renderTimeTravelReport selects format properly", () => {
    const term = renderTimeTravelReport(sampleReport, "terminal");
    const md = renderTimeTravelReport(sampleReport, "markdown");
    const json = renderTimeTravelReport(sampleReport, "json");

    expect(term).toContain("AGENT TIME-TRAVEL");
    expect(md).toContain("# ⏱");
    expect(json.startsWith("{")).toBe(true);
  });
});

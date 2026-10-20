import { describe, it, expect } from "vitest";
import { ArenaTournamentRunner } from "../../src/arena/runner.js";
import { CandidateWithTarget } from "../../src/arena/types.js";
import { ScenarioDefinition } from "../../src/core/types.js";

describe("ArenaTournamentRunner", () => {
  const scenario: ScenarioDefinition = {
    id: "arena-task-1",
    name: "Write File Task",
    workspace: { cleanup: true, gitInit: false },
    task: { instruction: "Write output.txt with 'OK'" },
    budgets: { maxTurns: 5, maxTokens: 10000, timeoutMs: 30000 },
    assertions: {
      files: [
        {
          path: "output.txt",
          shouldExist: true,
          contains: "OK",
        },
      ],
    },
  };

  const candidateA: CandidateWithTarget = {
    id: "agent-fast",
    name: "Fast Agent",
    initialRating: 1500,
    target: async (ctx) => {
      ctx.recorder.startTurn("Create file quickly");
      await ctx.workspace.writeFile("output.txt", "OK");
      ctx.recorder.completeTurn("Done");
    },
  };

  const candidateB: CandidateWithTarget = {
    id: "agent-slow",
    name: "Slow Agent",
    initialRating: 1500,
    target: async (ctx) => {
      ctx.recorder.startTurn("Turn 1 - thinking");
      ctx.recorder.completeTurn("Next");
      ctx.recorder.startTurn("Turn 2 - write file");
      await ctx.workspace.writeFile("output.txt", "OK");
      ctx.recorder.completeTurn("Done");
    },
  };

  const candidateC: CandidateWithTarget = {
    id: "agent-failing",
    name: "Failing Agent",
    initialRating: 1500,
    target: async (ctx) => {
      ctx.recorder.startTurn("Turn 1 - do nothing");
      ctx.recorder.completeTurn("Done");
    },
  };

  it("should execute round-robin tournament and rank candidates accurately", async () => {
    const runner = new ArenaTournamentRunner({
      mode: "round-robin",
      rounds: 1,
    });

    const report = await runner.run({
      candidates: [candidateA, candidateB, candidateC],
      scenarios: [scenario],
    });

    expect(report.totalMatches).toBe(3);
    expect(report.leaderboard.length).toBe(3);

    // Fast Agent should be ranked #1
    expect(report.topPerformer.candidateId).toBe("agent-fast");
    expect(report.leaderboard[0].candidateId).toBe("agent-fast");
    expect(report.leaderboard[1].candidateId).toBe("agent-slow");
    expect(report.leaderboard[2].candidateId).toBe("agent-failing");

    // Check Elo ratings
    expect(report.leaderboard[0].rating).toBeGreaterThan(1500);
    expect(report.leaderboard[2].rating).toBeLessThan(1500);

    // Check cross-table
    expect(report.crossTable["agent-fast"]["agent-failing"].wins).toBe(1);
    expect(report.crossTable["agent-failing"]["agent-fast"].losses).toBe(1);
    expect(report.crossTable["agent-fast"]["agent-slow"].wins).toBe(1);
  });

  it("should trigger lifecycle hooks during tournament run", async () => {
    const runner = new ArenaTournamentRunner({ mode: "round-robin", rounds: 1 });
    let startedCount = 0;
    let completedCount = 0;
    let roundCompleted = false;

    await runner.run({
      candidates: [candidateA, candidateB],
      scenarios: [scenario],
      onMatchStart: () => {
        startedCount++;
      },
      onMatchComplete: () => {
        completedCount++;
      },
      onRoundComplete: () => {
        roundCompleted = true;
      },
    });

    expect(startedCount).toBe(1);
    expect(completedCount).toBe(1);
    expect(roundCompleted).toBe(true);
  });
});

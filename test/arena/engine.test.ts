import { describe, it, expect } from "vitest";
import { ArenaEngine } from "../../src/arena/engine.js";
import { CandidateWithTarget } from "../../src/arena/types.js";
import { ScenarioDefinition } from "../../src/core/types.js";

describe("ArenaEngine", () => {
  const scenario: ScenarioDefinition = {
    id: "engine-test-scen",
    name: "Engine Test Scenario",
    workspace: { cleanup: true, gitInit: false },
    task: { instruction: "Write hello.txt" },
    budgets: { maxTurns: 5, maxTokens: 5000, timeoutMs: 20000 },
    assertions: {
      files: [{ path: "hello.txt", shouldExist: true, contains: "hello" }],
    },
  };

  const agent1: CandidateWithTarget = {
    id: "a1",
    name: "Agent 1",
    initialRating: 1600,
    target: async (ctx) => {
      ctx.recorder.startTurn("write hello");
      await ctx.workspace.writeFile("hello.txt", "hello");
      ctx.recorder.completeTurn("done");
    },
  };

  const agent2: CandidateWithTarget = {
    id: "a2",
    name: "Agent 2",
    initialRating: 1400,
    target: async (ctx) => {
      ctx.recorder.startTurn("turn 1");
      ctx.recorder.completeTurn("step 1");
      ctx.recorder.startTurn("turn 2");
      await ctx.workspace.writeFile("hello.txt", "hello");
      ctx.recorder.completeTurn("done");
    },
  };

  it("should predict match outcomes based on rating differences", () => {
    const engine = new ArenaEngine();
    const pred = engine.predictMatchOutcome(1700, 1500, "elo");
    expect(pred.winProbA).toBeGreaterThan(0.7);
    expect(pred.winProbB).toBeLessThan(0.3);
    expect(pred.winProbA + pred.winProbB).toBeCloseTo(1.0, 2);
  });

  it("should evaluate a direct 1v1 match between two candidates", async () => {
    const engine = new ArenaEngine();
    const match = await engine.evaluateMatch(agent1, agent2, scenario);

    expect(match.candidateAId).toBe("a1");
    expect(match.candidateBId).toBe("a2");
    expect(match.outcome).toBe("win_a");
    expect(match.scoreA).toBe(1.0);
    expect(match.scoreB).toBe(0.0);
  });

  it("should run full tournament via engine facade", async () => {
    const engine = new ArenaEngine();
    const report = await engine.runTournament({
      candidates: [agent1, agent2],
      scenarios: [scenario],
      config: { mode: "round-robin", rounds: 1 },
    });

    expect(report.totalMatches).toBe(1);
    expect(report.topPerformer.candidateId).toBe("a1");
  });
});

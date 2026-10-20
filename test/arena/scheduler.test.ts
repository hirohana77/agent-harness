import { describe, it, expect } from "vitest";
import { MatchScheduler } from "../../src/arena/scheduler.js";
import { CandidateWithTarget } from "../../src/arena/types.js";
import { ScenarioDefinition } from "../../src/core/types.js";

describe("MatchScheduler", () => {
  const dummyTarget = async () => {};
  const candidates: CandidateWithTarget[] = [
    { id: "agent-1", name: "Agent 1", initialRating: 1600, target: dummyTarget },
    { id: "agent-2", name: "Agent 2", initialRating: 1500, target: dummyTarget },
    { id: "agent-3", name: "Agent 3", initialRating: 1400, target: dummyTarget },
    { id: "agent-4", name: "Agent 4", initialRating: 1300, target: dummyTarget },
  ];

  const scenarios: ScenarioDefinition[] = [
    {
      id: "scen-1",
      name: "Scenario 1",
      workspace: { cleanup: true, gitInit: false },
      task: { instruction: "Test 1" },
      assertions: {},
    },
    {
      id: "scen-2",
      name: "Scenario 2",
      workspace: { cleanup: true, gitInit: false },
      task: { instruction: "Test 2" },
      assertions: {},
    },
  ];

  it("should generate full round-robin pairings", () => {
    const scheduler = new MatchScheduler(42);
    // 4 candidates: 4 * 3 / 2 = 6 pairs. 2 scenarios, 1 round = 12 matches.
    const pairings = scheduler.schedule(candidates, scenarios, "round-robin", 1);
    expect(pairings.length).toBe(12);

    const matchIds = new Set(pairings.map((p) => p.matchId));
    expect(matchIds.size).toBe(12);
  });

  it("should generate Swiss pairings based on rank", () => {
    const scheduler = new MatchScheduler(42);
    // 4 candidates paired adjacent: (0, 1), (2, 3) = 2 pairs. 2 scenarios = 4 matches.
    const pairings = scheduler.schedule(candidates, scenarios, "swiss", 1);
    expect(pairings.length).toBe(4);

    expect(pairings[0].candidateA.id).toBe("agent-1");
    expect(pairings[0].candidateB.id).toBe("agent-2");
    expect(pairings[2].candidateA.id).toBe("agent-3");
    expect(pairings[2].candidateB.id).toBe("agent-4");
  });

  it("should generate Bracket elimination pairings (1 vs N, 2 vs N-1)", () => {
    const scheduler = new MatchScheduler(42);
    // 1 vs 4, 2 vs 3 = 2 pairings * 2 scenarios = 4 matches
    const pairings = scheduler.schedule(candidates, scenarios, "bracket");
    expect(pairings.length).toBe(4);

    expect(pairings[0].candidateA.id).toBe("agent-1");
    expect(pairings[0].candidateB.id).toBe("agent-4");
    expect(pairings[2].candidateA.id).toBe("agent-2");
    expect(pairings[2].candidateB.id).toBe("agent-3");
  });

  it("should throw error if fewer than 2 candidates", () => {
    const scheduler = new MatchScheduler(42);
    expect(() =>
      scheduler.schedule([candidates[0]], scenarios, "round-robin")
    ).toThrow("at least 2 candidates");
  });

  it("should throw error if 0 scenarios", () => {
    const scheduler = new MatchScheduler(42);
    expect(() =>
      scheduler.schedule(candidates, [], "round-robin")
    ).toThrow("at least 1 scenario");
  });
});

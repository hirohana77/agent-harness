import { describe, it, expect } from "vitest";
import {
  TerminalArenaReporter,
  MarkdownArenaReporter,
  JsonArenaReporter,
  renderArenaReport,
} from "../../src/arena/reporters/index.js";
import { ArenaReport } from "../../src/arena/types.js";

describe("Arena Reporters", () => {
  const mockReport: ArenaReport = {
    tournamentId: "tourney-test",
    mode: "round-robin",
    timestamp: "2026-10-21T03:00:00.000Z",
    totalMatches: 2,
    scenariosCount: 1,
    candidatesCount: 2,
    leaderboard: [
      {
        rank: 1,
        candidateId: "agent-1",
        name: "Agent One",
        rating: 1532,
        ratingDeviation: 320,
        volatility: 0.06,
        matchesPlayed: 2,
        wins: 2,
        draws: 0,
        losses: 0,
        winRate: 1.0,
        avgCompositeScore: 0.95,
        taskSuccessRate: 1.0,
        avgTurns: 2.0,
        avgTokens: 2500,
        avgDurationMs: 1200,
      },
      {
        rank: 2,
        candidateId: "agent-2",
        name: "Agent Two",
        rating: 1468,
        ratingDeviation: 320,
        volatility: 0.06,
        matchesPlayed: 2,
        wins: 0,
        draws: 0,
        losses: 2,
        winRate: 0.0,
        avgCompositeScore: 0.65,
        taskSuccessRate: 0.5,
        avgTurns: 4.5,
        avgTokens: 4500,
        avgDurationMs: 2800,
      },
    ],
    crossTable: {
      "agent-1": {
        "agent-2": { wins: 2, draws: 0, losses: 0, matchCount: 2 },
      },
      "agent-2": {
        "agent-1": { wins: 0, draws: 0, losses: 2, matchCount: 2 },
      },
    },
    matches: [
      {
        matchId: "m1",
        round: 1,
        scenarioId: "scen-1",
        candidateAId: "agent-1",
        candidateBId: "agent-2",
        outcome: "win_a",
        scoreA: 1.0,
        scoreB: 0.0,
        margin: 0.3,
        ratingDeltaA: 16,
        ratingDeltaB: -16,
        metricsA: {
          passed: true,
          turns: 2,
          tokens: 2500,
          durationMs: 1200,
          violations: 0,
          compositeScore: 0.95,
        },
        metricsB: {
          passed: true,
          turns: 5,
          tokens: 5000,
          durationMs: 3000,
          violations: 0,
          compositeScore: 0.65,
        },
        reason: "Candidate A outperformed B with fewer turns",
        timestamp: "2026-10-21T03:00:00.000Z",
      },
    ],
    topPerformer: {
      rank: 1,
      candidateId: "agent-1",
      name: "Agent One",
      rating: 1532,
      matchesPlayed: 2,
      wins: 2,
      draws: 0,
      losses: 0,
      winRate: 1.0,
      avgCompositeScore: 0.95,
      taskSuccessRate: 1.0,
      avgTurns: 2.0,
      avgTokens: 2500,
      avgDurationMs: 1200,
    },
  };

  it("should render terminal report", () => {
    const rendered = TerminalArenaReporter.render(mockReport);
    expect(rendered).toContain("MULTI-AGENT TOURNAMENT ARENA REPORT");
    expect(rendered).toContain("tourney-test");
    expect(rendered).toContain("Agent One");
    expect(rendered).toContain("1532");
    expect(rendered).toContain("Head-to-Head Cross Table");
  });

  it("should render markdown report with leaderboard and cross table", () => {
    const rendered = MarkdownArenaReporter.render(mockReport);
    expect(rendered).toContain("# Multi-Agent Tournament Arena Report");
    expect(rendered).toContain("| 🥇 | **Agent One** (`agent-1`)");
    expect(rendered).toContain("## ⚔ Head-to-Head Cross Table");
    expect(rendered).toContain("## 📝 Match Logs");
  });

  it("should render json report", () => {
    const rendered = JsonArenaReporter.render(mockReport);
    const parsed = JSON.parse(rendered);
    expect(parsed.tournamentId).toBe("tourney-test");
    expect(parsed.leaderboard.length).toBe(2);
  });

  it("should dispatch format via renderArenaReport facade", () => {
    expect(renderArenaReport(mockReport, "terminal")).toContain("MULTI-AGENT TOURNAMENT ARENA REPORT");
    expect(renderArenaReport(mockReport, "markdown")).toContain("# Multi-Agent Tournament");
    expect(renderArenaReport(mockReport, "json")).toContain('"tournamentId": "tourney-test"');
  });
});

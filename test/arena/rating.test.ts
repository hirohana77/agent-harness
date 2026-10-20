import { describe, it, expect } from "vitest";
import {
  EloRatingEngine,
  Glicko2RatingEngine,
  createRatingEngine,
} from "../../src/arena/rating.js";
import { AgentStanding } from "../../src/arena/types.js";

describe("RatingEngine", () => {
  const createStanding = (id: string, rating: number, matches = 0, rd = 350): AgentStanding => ({
    rank: 1,
    candidateId: id,
    name: id,
    rating,
    ratingDeviation: rd,
    volatility: 0.06,
    matchesPlayed: matches,
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: 0,
    avgCompositeScore: 0.8,
    taskSuccessRate: 1.0,
    avgTurns: 3,
    avgTokens: 2000,
    avgDurationMs: 1500,
  });

  describe("EloRatingEngine", () => {
    it("should calculate 50% expected score for equal ratings", () => {
      const elo = new EloRatingEngine();
      const exp = elo.getExpectedScore(1500, 1500);
      expect(exp).toBeCloseTo(0.5, 5);
    });

    it("should calculate expected score > 0.5 for higher rated candidate", () => {
      const elo = new EloRatingEngine();
      const exp = elo.getExpectedScore(1700, 1500);
      expect(exp).toBeGreaterThan(0.7);
    });

    it("should grant larger rating delta to underdog on victory", () => {
      const elo = new EloRatingEngine({ dynamicKFactor: false, kFactor: 32 });
      const underdog = createStanding("underdog", 1300, 20);
      const favorite = createStanding("favorite", 1700, 20);

      const update = elo.calculateUpdate(underdog, favorite, 1.0, 0.0);
      expect(update.deltaA).toBeGreaterThan(25);
      expect(update.deltaB).toBeLessThan(-25);
      expect(update.newRatingA).toBe(1300 + update.deltaA);
      expect(update.newRatingB).toBe(1700 + update.deltaB);
    });

    it("should apply dynamic K-factor based on match count", () => {
      const elo = new EloRatingEngine({ dynamicKFactor: true, kFactor: 32 });
      const provisional = createStanding("prov", 1500, 2);
      const established = createStanding("est", 1500, 40);

      expect(elo.getKFactor(provisional)).toBe(48);
      expect(elo.getKFactor(established)).toBe(21);
    });
  });

  describe("Glicko2RatingEngine", () => {
    it("should update ratings and reduce rating deviation (RD)", () => {
      const glicko = new Glicko2RatingEngine();
      const standingA = createStanding("A", 1500, 0, 350);
      const standingB = createStanding("B", 1500, 0, 350);

      const update = glicko.calculateUpdate(standingA, standingB, 1.0, 0.0);
      expect(update.newRatingA).toBeGreaterThan(1500);
      expect(update.newRatingB).toBeLessThan(1500);
      expect(update.newRdA).toBeLessThan(350);
      expect(update.newRdB).toBeLessThan(350);
    });
  });

  describe("createRatingEngine", () => {
    it("should instantiate Elo engine by default", () => {
      const engine = createRatingEngine("elo");
      expect(engine.type).toBe("elo");
    });

    it("should instantiate Glicko-2 engine when requested", () => {
      const engine = createRatingEngine("glicko2");
      expect(engine.type).toBe("glicko2");
    });
  });
});

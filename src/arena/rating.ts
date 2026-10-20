import { AgentStanding, RatingSystemType } from "./types.js";

export interface RatingDeltaResult {
  deltaA: number;
  deltaB: number;
  newRatingA: number;
  newRatingB: number;
  newRdA?: number;
  newRdB?: number;
  newVolatilityA?: number;
  newVolatilityB?: number;
}

export interface IRatingEngine {
  readonly type: RatingSystemType;
  getExpectedScore(ratingA: number, ratingB: number): number;
  calculateUpdate(
    standingA: AgentStanding,
    standingB: AgentStanding,
    scoreA: number,
    scoreB: number
  ): RatingDeltaResult;
}

export class EloRatingEngine implements IRatingEngine {
  public readonly type: RatingSystemType = "elo";
  private baseKFactor: number;
  private dynamicK: boolean;

  constructor(options?: { kFactor?: number; dynamicKFactor?: boolean }) {
    this.baseKFactor = options?.kFactor ?? 32;
    this.dynamicK = options?.dynamicKFactor ?? true;
  }

  public getKFactor(standing: AgentStanding): number {
    if (!this.dynamicK) {
      return this.baseKFactor;
    }
    if (standing.matchesPlayed < 10) {
      return Math.round(this.baseKFactor * 1.5); // Provisional
    }
    if (standing.matchesPlayed > 30) {
      return Math.round(this.baseKFactor * 0.65); // Established
    }
    return this.baseKFactor;
  }

  public getExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  public calculateUpdate(
    standingA: AgentStanding,
    standingB: AgentStanding,
    scoreA: number,
    scoreB: number
  ): RatingDeltaResult {
    const expectedA = this.getExpectedScore(standingA.rating, standingB.rating);
    const expectedB = 1 - expectedA;

    const kA = this.getKFactor(standingA);
    const kB = this.getKFactor(standingB);

    const deltaA = Math.round(kA * (scoreA - expectedA));
    const deltaB = Math.round(kB * (scoreB - expectedB));

    return {
      deltaA,
      deltaB,
      newRatingA: Math.max(100, standingA.rating + deltaA),
      newRatingB: Math.max(100, standingB.rating + deltaB),
    };
  }
}

export class Glicko2RatingEngine implements IRatingEngine {
  public readonly type: RatingSystemType = "glicko2";
  private tau: number; // system constant, usually 0.3 - 1.2
  private static readonly SCALE = 173.7178;

  constructor(options?: { tau?: number }) {
    this.tau = options?.tau ?? 0.5;
  }

  public getExpectedScore(ratingA: number, ratingB: number): number {
    const rd = 100; // default estimated RD for standalone comparison
    const phi = rd / Glicko2RatingEngine.SCALE;
    const gPhi = 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
    const muDiff = (ratingA - ratingB) / Glicko2RatingEngine.SCALE;
    return 1 / (1 + Math.exp(-gPhi * muDiff));
  }

  public calculateUpdate(
    standingA: AgentStanding,
    standingB: AgentStanding,
    scoreA: number,
    scoreB: number
  ): RatingDeltaResult {
    const resA = this.updateSingle(
      standingA.rating,
      standingA.ratingDeviation ?? 350,
      standingA.volatility ?? 0.06,
      standingB.rating,
      standingB.ratingDeviation ?? 350,
      scoreA
    );

    const resB = this.updateSingle(
      standingB.rating,
      standingB.ratingDeviation ?? 350,
      standingB.volatility ?? 0.06,
      standingA.rating,
      standingA.ratingDeviation ?? 350,
      scoreB
    );

    return {
      deltaA: Math.round(resA.rating - standingA.rating),
      deltaB: Math.round(resB.rating - standingB.rating),
      newRatingA: Math.round(resA.rating),
      newRatingB: Math.round(resB.rating),
      newRdA: Math.round(resA.rd * 10) / 10,
      newRdB: Math.round(resB.rd * 10) / 10,
      newVolatilityA: Math.round(resA.volatility * 10000) / 10000,
      newVolatilityB: Math.round(resB.volatility * 10000) / 10000,
    };
  }

  private updateSingle(
    rating: number,
    rd: number,
    vol: number,
    oppRating: number,
    oppRd: number,
    score: number
  ): { rating: number; rd: number; volatility: number } {
    // Step 1: Convert to Glicko-2 scale
    const mu = (rating - 1500) / Glicko2RatingEngine.SCALE;
    const phi = rd / Glicko2RatingEngine.SCALE;
    const oppMu = (oppRating - 1500) / Glicko2RatingEngine.SCALE;
    const oppPhi = oppRd / Glicko2RatingEngine.SCALE;

    // Step 2: Compute variance v and delta
    const gPhi = 1 / Math.sqrt(1 + (3 * oppPhi * oppPhi) / (Math.PI * Math.PI));
    const e = 1 / (1 + Math.exp(-gPhi * (mu - oppMu)));
    const v = 1 / (gPhi * gPhi * e * (1 - e));
    const delta = v * gPhi * (score - e);

    // Step 3: Determine new volatility sigma' using Illinois-type iterative algorithm
    const a = Math.log(vol * vol);
    const f = (x: number): number => {
      const expX = Math.exp(x);
      const phiSq = phi * phi;
      const num1 = expX * (delta * delta - phiSq - v - expX);
      const den1 = 2 * (phiSq + v + expX) * (phiSq + v + expX);
      const term2 = (x - a) / (this.tau * this.tau);
      return num1 / den1 - term2;
    };

    let A = a;
    let B: number;
    if (delta * delta > phi * phi + v) {
      B = Math.log(delta * delta - phi * phi - v);
    } else {
      let k = 1;
      while (f(a - k * this.tau) < 0) {
        k++;
      }
      B = a - k * this.tau;
    }

    let fA = f(A);
    let fB = f(B);
    const epsilon = 0.000001;

    while (Math.abs(B - A) > epsilon) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
      if (fC * fB <= 0) {
        A = B;
        fA = fB;
      } else {
        fA = fA / 2;
      }
      B = C;
      fB = fC;
    }

    const newVolatility = Math.exp(A / 2);

    // Step 4: Update phi* (pre-rating deviation)
    const phiStar = Math.sqrt(phi * phi + newVolatility * newVolatility);

    // Step 5: Update phi' and mu'
    const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const newMu = mu + newPhi * newPhi * gPhi * (score - e);

    // Step 6: Convert back to Glicko scale
    const newRating = 1500 + Glicko2RatingEngine.SCALE * newMu;
    const newRd = Math.min(350, Math.max(30, Glicko2RatingEngine.SCALE * newPhi));

    return {
      rating: newRating,
      rd: newRd,
      volatility: newVolatility,
    };
  }
}

export function createRatingEngine(type: RatingSystemType, options?: { kFactor?: number; dynamicKFactor?: boolean; tau?: number }): IRatingEngine {
  if (type === "glicko2") {
    return new Glicko2RatingEngine({ tau: options?.tau });
  }
  return new EloRatingEngine({ kFactor: options?.kFactor, dynamicKFactor: options?.dynamicKFactor });
}

import { z } from "zod";

export const TournamentModeSchema = z.enum([
  "round-robin",
  "swiss",
  "matrix",
  "bracket",
]);

export const RatingSystemTypeSchema = z.enum([
  "elo",
  "glicko2",
]);

export const ScoringWeightsSchema = z.object({
  correctness: z.number().min(0).max(1).default(0.5),
  turns: z.number().min(0).max(1).default(0.15),
  tokens: z.number().min(0).max(1).default(0.15),
  duration: z.number().min(0).max(1).default(0.1),
  safety: z.number().min(0).max(1).default(0.1),
});

export const AgentCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  initialRating: z.number().default(1500),
  initialRd: z.number().default(350),
  initialVolatility: z.number().default(0.06),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const ArenaConfigSchema = z.object({
  mode: TournamentModeSchema.default("round-robin"),
  ratingSystem: RatingSystemTypeSchema.default("elo"),
  kFactor: z.number().positive().default(32),
  dynamicKFactor: z.boolean().default(true),
  concurrency: z.number().int().positive().default(4),
  rounds: z.number().int().positive().default(1),
  weights: ScoringWeightsSchema.default({
    correctness: 0.5,
    turns: 0.15,
    tokens: 0.15,
    duration: 0.1,
    safety: 0.1,
  }),
  seed: z.number().int().default(42),
  drawThreshold: z.number().min(0).max(1).default(0.01),
});

export const MatchOutcomeSchema = z.enum(["win_a", "win_b", "draw"]);

export const MatchMetricsSchema = z.object({
  passed: z.boolean(),
  turns: z.number().int().nonnegative(),
  tokens: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  violations: z.number().int().nonnegative(),
  compositeScore: z.number().min(0).max(1),
});

export const MatchRecordSchema = z.object({
  matchId: z.string(),
  round: z.number().int().positive(),
  scenarioId: z.string(),
  candidateAId: z.string(),
  candidateBId: z.string(),
  outcome: MatchOutcomeSchema,
  scoreA: z.number().min(0).max(1),
  scoreB: z.number().min(0).max(1),
  margin: z.number(),
  ratingDeltaA: z.number(),
  ratingDeltaB: z.number(),
  metricsA: MatchMetricsSchema,
  metricsB: MatchMetricsSchema,
  reason: z.string(),
  timestamp: z.string(),
});

export const AgentStandingSchema = z.object({
  rank: z.number().int().positive(),
  candidateId: z.string(),
  name: z.string(),
  rating: z.number(),
  ratingDeviation: z.number().optional(),
  volatility: z.number().optional(),
  matchesPlayed: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  avgCompositeScore: z.number().min(0).max(1),
  taskSuccessRate: z.number().min(0).max(1),
  avgTurns: z.number().nonnegative(),
  avgTokens: z.number().nonnegative(),
  avgDurationMs: z.number().nonnegative(),
});

export const HeadToHeadPairSchema = z.object({
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  matchCount: z.number().int().nonnegative(),
});

export const ArenaReportSchema = z.object({
  tournamentId: z.string(),
  mode: TournamentModeSchema,
  timestamp: z.string(),
  totalMatches: z.number().int().nonnegative(),
  scenariosCount: z.number().int().nonnegative(),
  candidatesCount: z.number().int().nonnegative(),
  leaderboard: z.array(AgentStandingSchema),
  crossTable: z.record(z.string(), z.record(z.string(), HeadToHeadPairSchema)),
  matches: z.array(MatchRecordSchema),
  topPerformer: AgentStandingSchema,
  categoryBreakdown: z.record(z.string(), z.array(AgentStandingSchema)).optional(),
});

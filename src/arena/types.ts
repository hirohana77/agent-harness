import { z } from "zod";
import {
  TournamentModeSchema,
  RatingSystemTypeSchema,
  ScoringWeightsSchema,
  AgentCandidateSchema,
  ArenaConfigSchema,
  MatchOutcomeSchema,
  MatchMetricsSchema,
  MatchRecordSchema,
  AgentStandingSchema,
  HeadToHeadPairSchema,
  ArenaReportSchema,
} from "./schemas.js";
import { AgentAdapter, ScenarioDefinition } from "../core/types.js";
import { AgentExecutionContext } from "../core/harness.js";

export type TournamentMode = z.infer<typeof TournamentModeSchema>;
export type RatingSystemType = z.infer<typeof RatingSystemTypeSchema>;
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;
export type AgentCandidate = z.infer<typeof AgentCandidateSchema>;
export type ArenaConfig = z.infer<typeof ArenaConfigSchema>;
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;
export type MatchMetrics = z.infer<typeof MatchMetricsSchema>;
export type MatchRecord = z.infer<typeof MatchRecordSchema>;
export type AgentStanding = z.infer<typeof AgentStandingSchema>;
export type HeadToHeadPair = z.infer<typeof HeadToHeadPairSchema>;
export type ArenaReport = z.infer<typeof ArenaReportSchema>;

export type AgentCandidateTarget = AgentAdapter | ((ctx: AgentExecutionContext) => Promise<void>);

export interface CandidateWithTarget {
  id: string;
  name: string;
  description?: string;
  initialRating?: number;
  initialRd?: number;
  initialVolatility?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  target: AgentCandidateTarget;
}

export interface MatchPairing {
  matchId: string;
  round: number;
  scenario: ScenarioDefinition;
  candidateA: CandidateWithTarget;
  candidateB: CandidateWithTarget;
}

export interface ArenaExecutionOptions {
  candidates: CandidateWithTarget[];
  scenarios: ScenarioDefinition[];
  config?: Partial<ArenaConfig>;
  onMatchStart?: (pairing: MatchPairing) => void;
  onMatchComplete?: (record: MatchRecord) => void;
  onRoundComplete?: (round: number, standings: AgentStanding[]) => void;
}

export type ArenaReportFormat = "terminal" | "markdown" | "json";

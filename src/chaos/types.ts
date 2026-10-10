import { z } from "zod";
import {
  ChaosFaultTypeSchema,
  ChaosOccurrenceStrategySchema,
  ChaosFaultConfigSchema,
  ChaosRuleSchema,
  ChaosProfileSchema,
  ChaosEventSchema,
  AgentReactionSchema,
  ResilienceMetricsSchema,
  ResilienceScorecardSchema,
} from "./schemas.js";

export type ChaosFaultType = z.infer<typeof ChaosFaultTypeSchema>;
export type ChaosOccurrenceStrategy = z.infer<typeof ChaosOccurrenceStrategySchema>;
export type ChaosFaultConfig = z.infer<typeof ChaosFaultConfigSchema>;
export type ChaosRule = z.infer<typeof ChaosRuleSchema>;
export type ChaosProfile = z.infer<typeof ChaosProfileSchema>;
export type ChaosEvent = z.infer<typeof ChaosEventSchema>;
export type AgentReaction = z.infer<typeof AgentReactionSchema>;
export type ResilienceMetrics = z.infer<typeof ResilienceMetricsSchema>;
export type ResilienceScorecard = z.infer<typeof ResilienceScorecardSchema>;

export type ResilienceRating = "S" | "A" | "B" | "C" | "F";

export interface ChaosInterceptorResult {
  injected: boolean;
  rule?: ChaosRule;
  faultType?: ChaosFaultType;
  outputOverride?: {
    success: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
  };
  latencyMs?: number;
}

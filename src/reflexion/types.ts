import { Trajectory, ToolCallResult } from "../core/types.js";

export type ReflexionErrorClass =
  | "command-failure"
  | "test-regression"
  | "file-not-found"
  | "tool-error"
  | "syntax-ast-error"
  | "permission-denied"
  | "hallucinated-tool";

export type ReflexionEpisodeStatus =
  | "recovered"
  | "thrashing"
  | "oscillating"
  | "abandoned"
  | "regressed"
  | "exhausted";

export type ReflexionPathologyType =
  | "repetitive-thrashing"
  | "blind-retry"
  | "error-ignorance"
  | "oscillation"
  | "cascading-regression";

export type ReflexionRecoveryStrategy =
  | "parameter-adjustment"
  | "alternative-tool"
  | "code-patch-rework"
  | "workspace-cleanup"
  | "rollback-and-restart"
  | "multi-step-investigation";

export type ReflexionReportFormat = "terminal" | "markdown" | "json";

export interface FailureEpisode {
  id: string;
  errorClass: ReflexionErrorClass;
  triggerTurn: number;
  triggerToolCallId?: string;
  triggerToolName: string;
  errorMessage: string;
  exitCode?: number;
  status: ReflexionEpisodeStatus;
  recoveryTurn?: number;
  turnSpan: number;
  detectedPathologies: ReflexionPathologyType[];
  strategy?: ReflexionRecoveryStrategy;
  evidence?: string;
  resolutionProof?: string;
}

export interface PathologyFinding {
  id: string;
  type: ReflexionPathologyType;
  episodeId?: string;
  turnRange: [number, number];
  severity: "low" | "medium" | "high";
  description: string;
  evidence: string;
  suggestedRemediation: string;
}

export interface ErrorClassStat {
  total: number;
  recovered: number;
  recoveryRate: number;
}

export interface ReflexionMetrics {
  totalEpisodes: number;
  recoveredEpisodes: number;
  unresolvedEpisodes: number;
  selfHealingRate: number; // 0.0 - 1.0
  meanTurnsToRecovery: number;
  medianTurnsToRecovery: number;
  thrashingIndex: number; // 0 - 100
  cognitiveResilienceScore: number; // 0 - 100
  pathologyCount: number;
  strategyDistribution: Record<ReflexionRecoveryStrategy, number>;
  errorClassDistribution: Record<ReflexionErrorClass, ErrorClassStat>;
}

export interface ReflexionReport {
  scenarioId: string;
  agentId?: string;
  timestamp: string;
  metrics: ReflexionMetrics;
  episodes: FailureEpisode[];
  pathologies: PathologyFinding[];
  recommendations: string[];
}

export type ComparisonVerdict =
  | "significantly_improved"
  | "moderately_improved"
  | "neutral"
  | "degraded";

export interface ReflexionComparisonResult {
  baseline: {
    scenarioId: string;
    metrics: ReflexionMetrics;
  };
  comparative: {
    scenarioId: string;
    metrics: ReflexionMetrics;
  };
  deltaSelfHealingRate: number;
  deltaMeanTurnsToRecovery: number;
  deltaResilienceScore: number;
  deltaPathologyCount: number;
  verdict: ComparisonVerdict;
  summary: string;
}

export interface ReflexionAnalysisOptions {
  maxThrashingThreshold?: number;
  detectPathologies?: boolean;
  testCommandPatterns?: string[];
  format?: ReflexionReportFormat;
}

export interface ReflexionPromptConfig {
  maxPreviousAttempts?: number;
  includePathologies?: boolean;
  includeSuggestedAction?: boolean;
}

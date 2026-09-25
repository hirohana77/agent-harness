import { HarnessReport } from "../core/types.js";

export interface BenchmarkOptions {
  scenarioPaths: string[];
  concurrency?: number;
  stopOnFailure?: boolean;
  outputDir?: string;
}

export interface BenchmarkScenarioResult {
  scenarioId: string;
  scenarioName: string;
  filePath: string;
  passed: boolean;
  durationMs: number;
  totalTurns: number;
  tokensUsed: number;
  costUsd: number;
  passedAssertions: number;
  failedAssertions: number;
  error?: string;
  report?: HarnessReport;
}

export interface BenchmarkSummary {
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  passRatePercent: number;
  totalDurationMs: number;
  totalTokens: number;
  totalCostUsd: number;
  results: BenchmarkScenarioResult[];
}

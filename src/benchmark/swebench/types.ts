/**
 * SWE-bench task instance data types and evaluation specifications.
 * Compatible with SWE-bench / SWE-bench Lite / SWE-bench Verified datasets.
 */

export interface SWEBenchInstance {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  hints_text?: string;
  created_at?: string;
  patch?: string;
  test_patch?: string;
  version?: string;
  environment_setup_commit?: string;
  FAIL_TO_PASS: string[];
  PASS_TO_PASS: string[];
}

export interface SWEBenchAdapterOptions {
  sandboxBackend?: 'local' | 'docker' | 'podman';
  imagePrefix?: string;
  defaultImage?: string;
  defaultTimeoutMs?: number;
  defaultMaxTurns?: number;
  defaultMaxTokens?: number;
  includeHints?: boolean;
  testRunnerCommand?: string | ((instance: SWEBenchInstance) => string);
  customInitialFiles?: Record<string, string>;
  network?: string;
  memoryLimit?: string;
  cpuLimit?: number;
}

export interface SWEBenchPrediction {
  instance_id: string;
  model_patch: string;
  model_name_or_path?: string;
}

export type SWEBenchTestStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'NOT_RUN';

export type SWEBenchInstanceResolution = 'RESOLVED' | 'UNRESOLVED' | 'REGRESSION' | 'ERROR';

export interface SWEBenchTestResult {
  testName: string;
  category: 'FAIL_TO_PASS' | 'PASS_TO_PASS';
  status: SWEBenchTestStatus;
  expectedStatus: SWEBenchTestStatus;
  passed: boolean;
}

export interface SWEBenchInstanceEvalResult {
  instanceId: string;
  repo: string;
  resolved: boolean;
  resolution: SWEBenchInstanceResolution;
  failToPassTotal: number;
  failToPassPassed: number;
  passToPassTotal: number;
  passToPassPassed: number;
  testResults: SWEBenchTestResult[];
  durationMs: number;
  error?: string;
  rawOutput?: string;
}

export interface SWEBenchSuiteSummary {
  totalInstances: number;
  resolvedInstances: number;
  unresolvedInstances: number;
  regressions: number;
  errors: number;
  resolveRatePercent: number;
  totalDurationMs: number;
  byRepo: Record<string, {
    total: number;
    resolved: number;
    resolveRatePercent: number;
  }>;
  results: SWEBenchInstanceEvalResult[];
}

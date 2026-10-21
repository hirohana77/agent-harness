import { ScenarioDefinition, Trajectory, HarnessReport } from "../core/types.js";
import { AgentExecutionContext } from "../core/harness.js";

export type RedTeamRiskCategory =
  | "prompt-injection"
  | "indirect-injection"
  | "secret-exfiltration"
  | "privilege-escalation"
  | "destructive-command"
  | "supply-chain"
  | "defense-bypass";

export type ProbeSeverity = "low" | "medium" | "high" | "critical";

export type InjectionVector =
  | "instruction"
  | "file-injection"
  | "env-injection"
  | "mock-tool";

export type DefenseStatus =
  | "defended"
  | "exploited"
  | "refused"
  | "mitigated";

export type GuardrailMode = "none" | "audit" | "enforce";

export type RedTeamReportFormat = "terminal" | "markdown" | "json";

export interface VulnerabilityIndicator {
  /**
   * Command patterns (regex or substring) whose execution indicates a successful exploit
   */
  commandPatterns?: string[];
  /**
   * File patterns (regex or substring) whose modification or access indicates exploit
   */
  filePatterns?: string[];
  /**
   * String patterns in trajectory output or tool responses indicating leakage
   */
  payloadLeakPatterns?: string[];
  /**
   * Minimum pattern matches required to consider probe exploited (default: 1)
   */
  minMatches?: number;
}

export interface RedTeamProbe {
  id: string;
  name: string;
  category: RedTeamRiskCategory;
  severity: ProbeSeverity;
  description: string;
  vector: InjectionVector;
  payload: string;
  targetFile?: string;
  canarySecret?: string;
  vulnerabilityIndicator: VulnerabilityIndicator;
  mitigation?: string;
  metadata?: Record<string, unknown>;
}

export interface VulnerabilityFinding {
  probeId: string;
  probeName: string;
  category: RedTeamRiskCategory;
  severity: ProbeSeverity;
  status: DefenseStatus;
  vector: InjectionVector;
  evidence: string[];
  turnIndex?: number;
  triggerCommand?: string;
  mitigation?: string;
  timestamp: string;
}

export interface CategoryScorecard {
  category: RedTeamRiskCategory;
  totalProbes: number;
  exploitedCount: number;
  defendedCount: number;
  attackSuccessRate: number; // 0.0 - 1.0
  riskLevel: "safe" | "low" | "medium" | "high" | "critical";
}

export interface SeverityScorecard {
  total: number;
  exploited: number;
  defended: number;
  asr: number;
}

export interface GuardrailCheckResult {
  allowed: boolean;
  violation?: {
    guardrailName: string;
    reason: string;
    pattern?: string;
    severity: ProbeSeverity;
  };
  sanitizedInput?: string;
}

export interface SafetyGuardrail {
  readonly name: string;
  readonly description: string;
  checkCommand?(command: string, context?: Record<string, unknown>): Promise<GuardrailCheckResult> | GuardrailCheckResult;
  checkFileAccess?(filePath: string, mode: "read" | "write" | "delete"): Promise<GuardrailCheckResult> | GuardrailCheckResult;
  checkOutput?(output: string, context?: Record<string, unknown>): Promise<GuardrailCheckResult> | GuardrailCheckResult;
}

export interface RedTeamRunnerConfig {
  categories?: RedTeamRiskCategory[];
  severities?: ProbeSeverity[];
  probes?: string[]; // specific probe IDs
  guardrailMode?: GuardrailMode;
  guardrails?: SafetyGuardrail[];
  stopOnFirstExploit?: boolean;
  timeoutMs?: number;
}

export interface ProbeRunOutcome {
  probe: RedTeamProbe;
  status: DefenseStatus;
  exploited: boolean;
  evidence: string[];
  triggerCommand?: string;
  turnIndex?: number;
  report?: HarnessReport;
  trajectory?: Trajectory;
  durationMs: number;
  guardrailBlocked?: boolean;
}

export interface RedTeamAuditReport {
  id: string;
  scenarioId: string;
  scenarioName?: string;
  timestamp: string;
  durationMs: number;
  totalProbes: number;
  exploitedCount: number;
  defendedCount: number;
  attackSuccessRate: number; // 0.0 - 1.0
  safetyScore: number; // 0 - 100
  overallRiskLevel: "safe" | "low" | "medium" | "high" | "critical";
  guardrailMode: GuardrailMode;
  guardrailInterceptions: number;
  categoryScorecards: Record<RedTeamRiskCategory, CategoryScorecard>;
  severityScorecards: Record<ProbeSeverity, SeverityScorecard>;
  findings: VulnerabilityFinding[];
}

export type RedTeamAgentTarget = (ctx: AgentExecutionContext) => Promise<void>;

export interface DefenseBenchmarkComparison {
  baselineReport: RedTeamAuditReport;
  guardedReport: RedTeamAuditReport;
  deltaAttackSuccessRate: number; // baseline ASR - guarded ASR (positive is improvement)
  deltaSafetyScore: number; // guarded score - baseline score (positive is improvement)
  preventedExploitsCount: number;
}

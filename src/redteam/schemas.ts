import { z } from "zod";

export const RedTeamRiskCategorySchema = z.enum([
  "prompt-injection",
  "indirect-injection",
  "secret-exfiltration",
  "privilege-escalation",
  "destructive-command",
  "supply-chain",
  "defense-bypass",
]);

export const ProbeSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const InjectionVectorSchema = z.enum([
  "instruction",
  "file-injection",
  "env-injection",
  "mock-tool",
]);

export const DefenseStatusSchema = z.enum([
  "defended",
  "exploited",
  "refused",
  "mitigated",
]);

export const GuardrailModeSchema = z.enum(["none", "audit", "enforce"]);

export const VulnerabilityIndicatorSchema = z.object({
  commandPatterns: z.array(z.string()).optional(),
  filePatterns: z.array(z.string()).optional(),
  payloadLeakPatterns: z.array(z.string()).optional(),
  minMatches: z.number().int().min(1).default(1),
});

export const RedTeamProbeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: RedTeamRiskCategorySchema,
  severity: ProbeSeveritySchema,
  description: z.string(),
  vector: InjectionVectorSchema,
  payload: z.string(),
  targetFile: z.string().optional(),
  canarySecret: z.string().optional(),
  vulnerabilityIndicator: VulnerabilityIndicatorSchema,
  mitigation: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const VulnerabilityFindingSchema = z.object({
  probeId: z.string(),
  probeName: z.string(),
  category: RedTeamRiskCategorySchema,
  severity: ProbeSeveritySchema,
  status: DefenseStatusSchema,
  vector: InjectionVectorSchema,
  evidence: z.array(z.string()),
  turnIndex: z.number().int().optional(),
  triggerCommand: z.string().optional(),
  mitigation: z.string().optional(),
  timestamp: z.string(),
});

export const CategoryScorecardSchema = z.object({
  category: RedTeamRiskCategorySchema,
  totalProbes: z.number().int().nonnegative(),
  exploitedCount: z.number().int().nonnegative(),
  defendedCount: z.number().int().nonnegative(),
  attackSuccessRate: z.number().min(0).max(1),
  riskLevel: z.enum(["safe", "low", "medium", "high", "critical"]),
});

export const SeverityScorecardSchema = z.object({
  total: z.number().int().nonnegative(),
  exploited: z.number().int().nonnegative(),
  defended: z.number().int().nonnegative(),
  asr: z.number().min(0).max(1),
});

export const RedTeamAuditReportSchema = z.object({
  id: z.string(),
  scenarioId: z.string(),
  scenarioName: z.string().optional(),
  timestamp: z.string(),
  durationMs: z.number().nonnegative(),
  totalProbes: z.number().int().nonnegative(),
  exploitedCount: z.number().int().nonnegative(),
  defendedCount: z.number().int().nonnegative(),
  attackSuccessRate: z.number().min(0).max(1),
  safetyScore: z.number().min(0).max(100),
  overallRiskLevel: z.enum(["safe", "low", "medium", "high", "critical"]),
  guardrailMode: GuardrailModeSchema,
  guardrailInterceptions: z.number().int().nonnegative(),
  categoryScorecards: z.record(RedTeamRiskCategorySchema, CategoryScorecardSchema),
  severityScorecards: z.record(ProbeSeveritySchema, SeverityScorecardSchema),
  findings: z.array(VulnerabilityFindingSchema),
});

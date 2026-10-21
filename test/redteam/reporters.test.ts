import { describe, it, expect } from "vitest";
import {
  renderRedTeamReport,
  renderBenchmarkComparison,
  TerminalRedTeamReporter,
  MarkdownRedTeamReporter,
  JsonRedTeamReporter,
} from "../../src/redteam/reporters/index.js";
import { RedTeamAuditReport } from "../../src/redteam/types.js";

describe("RedTeamReporters", () => {
  const sampleReport: RedTeamAuditReport = {
    id: "redteam_test_123",
    scenarioId: "scen-calc",
    scenarioName: "Calculator Test",
    timestamp: "2026-10-22T03:00:00.000Z",
    durationMs: 450,
    totalProbes: 2,
    exploitedCount: 1,
    defendedCount: 1,
    attackSuccessRate: 0.5,
    safetyScore: 50,
    overallRiskLevel: "high",
    guardrailMode: "audit",
    guardrailInterceptions: 1,
    categoryScorecards: {
      "prompt-injection": {
        category: "prompt-injection",
        totalProbes: 1,
        exploitedCount: 1,
        defendedCount: 0,
        attackSuccessRate: 1.0,
        riskLevel: "critical",
      },
      "privilege-escalation": {
        category: "privilege-escalation",
        totalProbes: 1,
        exploitedCount: 0,
        defendedCount: 1,
        attackSuccessRate: 0,
        riskLevel: "safe",
      },
      "indirect-injection": {
        category: "indirect-injection",
        totalProbes: 0,
        exploitedCount: 0,
        defendedCount: 0,
        attackSuccessRate: 0,
        riskLevel: "safe",
      },
      "secret-exfiltration": {
        category: "secret-exfiltration",
        totalProbes: 0,
        exploitedCount: 0,
        defendedCount: 0,
        attackSuccessRate: 0,
        riskLevel: "safe",
      },
      "destructive-command": {
        category: "destructive-command",
        totalProbes: 0,
        exploitedCount: 0,
        defendedCount: 0,
        attackSuccessRate: 0,
        riskLevel: "safe",
      },
      "supply-chain": {
        category: "supply-chain",
        totalProbes: 0,
        exploitedCount: 0,
        defendedCount: 0,
        attackSuccessRate: 0,
        riskLevel: "safe",
      },
      "defense-bypass": {
        category: "defense-bypass",
        totalProbes: 0,
        exploitedCount: 0,
        defendedCount: 0,
        attackSuccessRate: 0,
        riskLevel: "safe",
      },
    },
    severityScorecards: {
      critical: { total: 1, exploited: 1, defended: 0, asr: 1.0 },
      high: { total: 1, exploited: 0, defended: 1, asr: 0 },
      medium: { total: 0, exploited: 0, defended: 0, asr: 0 },
      low: { total: 0, exploited: 0, defended: 0, asr: 0 },
    },
    findings: [
      {
        probeId: "probe-prompt-system-override",
        probeName: "System Override",
        category: "prompt-injection",
        severity: "critical",
        status: "exploited",
        vector: "instruction",
        evidence: ["Turn 1: Command matched pattern [echo pwn]"],
        triggerCommand: "echo pwn",
        mitigation: "Hard prompt boundaries",
        timestamp: "2026-10-22T03:00:00.000Z",
      },
    ],
  };

  it("should render terminal format with ANSI and summary sections", () => {
    const rendered = renderRedTeamReport(sampleReport, "terminal");
    expect(rendered).toContain("ADVERSARIAL RED-TEAMING & SAFETY AUDIT REPORT");
    expect(rendered).toContain("Calculator Test");
    expect(rendered).toContain("50 / 100");
    expect(rendered).toContain("50.0%");
    expect(rendered).toContain("prompt-injection");
    expect(rendered).toContain("System Override");
  });

  it("should render markdown format with tables and findings", () => {
    const rendered = renderRedTeamReport(sampleReport, "markdown");
    expect(rendered).toContain("# Adversarial Red-Teaming & Safety Audit Report");
    expect(rendered).toContain("| **Safety Score** | **50 / 100** |");
    expect(rendered).toContain("### ⚠️ [CRITICAL] System Override (`probe-prompt-system-override`)");
    expect(rendered).toContain("- **Recommended Remediation**: Hard prompt boundaries");
  });

  it("should render json format parseable as valid JSON", () => {
    const rendered = renderRedTeamReport(sampleReport, "json");
    const parsed = JSON.parse(rendered);
    expect(parsed.id).toBe("redteam_test_123");
    expect(parsed.safetyScore).toBe(50);
  });

  it("should render benchmark comparison in terminal and markdown", () => {
    const comparison = {
      baselineReport: sampleReport,
      guardedReport: {
        ...sampleReport,
        exploitedCount: 0,
        defendedCount: 2,
        attackSuccessRate: 0,
        safetyScore: 100,
        overallRiskLevel: "safe" as const,
        guardrailInterceptions: 2,
      },
      deltaAttackSuccessRate: 0.5,
      deltaSafetyScore: 50,
      preventedExploitsCount: 1,
    };

    const term = renderBenchmarkComparison(comparison, "terminal");
    expect(term).toContain("DEFENSE POSTURE BENCHMARK");
    expect(term).toContain("+50");

    const md = renderBenchmarkComparison(comparison, "markdown");
    expect(md).toContain("# Defense Posture Benchmark Comparison");
    expect(md).toContain("+50");
  });
});

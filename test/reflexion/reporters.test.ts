import { describe, expect, it } from "vitest";
import {
  renderReflexionReport,
  renderReflexionComparison,
  TerminalReflexionReporter,
  MarkdownReflexionReporter,
  JsonReflexionReporter,
} from "../../src/reflexion/reporters/index.js";
import { ReflexionReport, ReflexionComparisonResult } from "../../src/reflexion/types.js";

describe("Reflexion Reporters", () => {
  const sampleReport: ReflexionReport = {
    scenarioId: "test-debug-scenario",
    agentId: "agent-alpha",
    timestamp: "2026-10-23T03:00:00.000Z",
    metrics: {
      totalEpisodes: 2,
      recoveredEpisodes: 1,
      unresolvedEpisodes: 1,
      selfHealingRate: 0.5,
      meanTurnsToRecovery: 2.0,
      medianTurnsToRecovery: 2.0,
      thrashingIndex: 10,
      cognitiveResilienceScore: 65,
      pathologyCount: 1,
      strategyDistribution: {
        "parameter-adjustment": 0,
        "alternative-tool": 0,
        "code-patch-rework": 1,
        "workspace-cleanup": 0,
        "rollback-and-restart": 0,
        "multi-step-investigation": 0,
      },
      errorClassDistribution: {
        "command-failure": { total: 0, recovered: 0, recoveryRate: 1 },
        "test-regression": { total: 1, recovered: 1, recoveryRate: 1 },
        "file-not-found": { total: 1, recovered: 0, recoveryRate: 0 },
        "tool-error": { total: 0, recovered: 0, recoveryRate: 1 },
        "syntax-ast-error": { total: 0, recovered: 0, recoveryRate: 1 },
        "permission-denied": { total: 0, recovered: 0, recoveryRate: 1 },
        "hallucinated-tool": { total: 0, recovered: 0, recoveryRate: 1 },
      },
    },
    episodes: [
      {
        id: "ep-1",
        errorClass: "test-regression",
        triggerTurn: 2,
        triggerToolName: "bash",
        errorMessage: "FAIL test/app.test.js",
        status: "recovered",
        recoveryTurn: 3,
        turnSpan: 2,
        detectedPathologies: [],
        strategy: "code-patch-rework",
      },
      {
        id: "ep-2",
        errorClass: "file-not-found",
        triggerTurn: 5,
        triggerToolName: "bash",
        errorMessage: "ENOENT config.json",
        status: "abandoned",
        turnSpan: 1,
        detectedPathologies: ["blind-retry"],
      },
    ],
    pathologies: [
      {
        id: "p-1",
        type: "blind-retry",
        turnRange: [5, 6],
        severity: "medium",
        description: "Re-ran command without file changes",
        evidence: "pytest run consecutively",
        suggestedRemediation: "Verify file presence before running",
      },
    ],
    recommendations: ["Introduce reflection hints on ENOENT."],
  };

  const sampleComparison: ReflexionComparisonResult = {
    baseline: { scenarioId: "baseline-run", metrics: sampleReport.metrics },
    comparative: {
      scenarioId: "reflexive-run",
      metrics: {
        ...sampleReport.metrics,
        selfHealingRate: 1.0,
        recoveredEpisodes: 2,
        unresolvedEpisodes: 0,
        cognitiveResilienceScore: 90,
        pathologyCount: 0,
      },
    },
    deltaSelfHealingRate: 0.5,
    deltaMeanTurnsToRecovery: -0.5,
    deltaResilienceScore: 25,
    deltaPathologyCount: -1,
    verdict: "significantly_improved",
    summary: "Resilience score improved by +25 points, SHR increased by +50.0%, eliminated 1 cognitive pathologies.",
  };

  it("renders terminal report containing expected headings and metrics", () => {
    const output = TerminalReflexionReporter.render(sampleReport);
    expect(output).toContain("AGENT REFLEXION & SELF-CORRECTION DIAGNOSTIC REPORT");
    expect(output).toContain("test-debug-scenario");
    expect(output).toContain("Self-Healing Rate (SHR):");
    expect(output).toContain("Cognitive Resilience Score:");
    expect(output).toContain("blind-retry");
    expect(output).toContain("Introduce reflection hints on ENOENT.");
  });

  it("renders markdown report containing tables and badges", () => {
    const output = MarkdownReflexionReporter.render(sampleReport);
    expect(output).toContain("# Agent Reflexion & Self-Correction Diagnostic Report");
    expect(output).toContain("| **Self-Healing Rate (SHR)** | **`50.0%`**");
    expect(output).toContain("## Failure Episodes Breakdown");
    expect(output).toContain("## Cognitive Pathologies");
    expect(output).toContain("## Actionable Diagnostic Recommendations");
  });

  it("renders valid json report", () => {
    const output = JsonReflexionReporter.render(sampleReport);
    const parsed = JSON.parse(output);
    expect(parsed.scenarioId).toBe("test-debug-scenario");
    expect(parsed.metrics.cognitiveResilienceScore).toBe(65);
  });

  it("renders comparison across terminal, markdown, and json formats", () => {
    const term = renderReflexionComparison(sampleComparison, "terminal");
    expect(term).toContain("AGENT REFLEXION RESILIENCE COMPARATIVE BENCHMARK");
    expect(term).toContain("SIGNIFICANTLY IMPROVED");

    const md = renderReflexionComparison(sampleComparison, "markdown");
    expect(md).toContain("# Agent Reflexion Resilience Comparative Benchmark");
    expect(md).toContain("`SIGNIFICANTLY_IMPROVED`");

    const json = renderReflexionComparison(sampleComparison, "json");
    const parsed = JSON.parse(json);
    expect(parsed.verdict).toBe("significantly_improved");
    expect(parsed.deltaResilienceScore).toBe(25);
  });

  it("dispatcher renderReflexionReport routes correctly by format", () => {
    expect(renderReflexionReport(sampleReport, "terminal")).toContain("AGENT REFLEXION");
    expect(renderReflexionReport(sampleReport, "markdown")).toContain("# Agent Reflexion");
    expect(JSON.parse(renderReflexionReport(sampleReport, "json")).scenarioId).toBe("test-debug-scenario");
  });
});

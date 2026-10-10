import { describe, it, expect } from "vitest";
import {
  renderResilienceScorecard,
  TerminalResilienceReporter,
  MarkdownResilienceReporter,
  JsonResilienceReporter,
} from "../../src/chaos/reporters/index.js";
import { ResilienceScorecard } from "../../src/chaos/types.js";

describe("Chaos Reporters Suite", () => {
  const mockScorecard: ResilienceScorecard = {
    profileId: "transient-network-flakiness",
    scenarioId: "test-scenario-1",
    timestamp: "2026-10-11T03:00:00.000Z",
    metrics: {
      totalToolCalls: 10,
      injectedFaults: 2,
      faultInjectionRate: 0.2,
      recoveredFaults: 2,
      recoveryRate: 1.0,
      meanTurnsToRecovery: 1.5,
      loopPenaltyCount: 0,
      adversarialPoisonCount: 0,
      poisonDefenseRate: 1.0,
      resilienceScore: 95.0,
      rating: "S",
    },
    events: [
      {
        id: "evt-1",
        timestamp: 1728615600000,
        ruleId: "net-drop-1",
        faultType: "error",
        toolName: "exec_command",
        args: { cmd: "git clone ..." },
        callIndex: 1,
        details: {
          outputOverride: { success: false, exitCode: 1, error: "Connection reset" },
        },
      },
    ],
    recommendations: [
      "Outstanding Resilience: Agent smoothly handled all injected faults, avoided adversarial traps, and recovered without loops.",
    ],
  };

  it("should render terminal format with ANSI codes and metrics", () => {
    const output = TerminalResilienceReporter.render(mockScorecard);
    expect(output).toContain("AGENT CHAOS RESILIENCE SCORECARD");
    expect(output).toContain("GRADE S");
    expect(output).toContain("95.0 / 100");
    expect(output).toContain("Injected Chaos Events");
    expect(output).toContain("git clone");
  });

  it("should render markdown format with tables and badges", () => {
    const output = MarkdownResilienceReporter.render(mockScorecard);
    expect(output).toContain("# Agent Chaos Resilience Report: transient-network-flakiness");
    expect(output).toContain("| **Fault Recovery Rate** | 100% (2/2) | ✅ Passed |");
    expect(output).toContain("| #1 | `exec_command` | `error` | `net-drop-1` |");
    expect(output).toContain("Architectural Recommendations");
  });

  it("should render valid JSON format", () => {
    const output = JsonResilienceReporter.render(mockScorecard);
    const parsed = JSON.parse(output);
    expect(parsed.metrics.rating).toBe("S");
    expect(parsed.metrics.resilienceScore).toBe(95.0);
  });

  it("should dispatch correctly via renderResilienceScorecard helper", () => {
    const term = renderResilienceScorecard(mockScorecard, "terminal");
    const md = renderResilienceScorecard(mockScorecard, "markdown");
    const json = renderResilienceScorecard(mockScorecard, "json");

    expect(term).toContain("AGENT CHAOS RESILIENCE SCORECARD");
    expect(md).toContain("# Agent Chaos Resilience Report");
    expect(JSON.parse(json).profileId).toBe("transient-network-flakiness");
  });
});

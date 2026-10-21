import { describe, it, expect, beforeEach } from "vitest";
import {
  BUILTIN_REDTEAM_PROBES,
  RedTeamProbeCatalog,
} from "../../src/redteam/catalog.js";
import { RedTeamProbeSchema } from "../../src/redteam/schemas.js";
import { RedTeamProbe } from "../../src/redteam/types.js";

describe("RedTeamProbeCatalog", () => {
  beforeEach(() => {
    RedTeamProbeCatalog.clearCustomProbes();
  });

  it("should have all built-in probes valid against schema", () => {
    expect(BUILTIN_REDTEAM_PROBES.length).toBeGreaterThanOrEqual(10);
    for (const probe of BUILTIN_REDTEAM_PROBES) {
      expect(() => RedTeamProbeSchema.parse(probe)).not.toThrow();
      expect(probe.id).toBeTruthy();
      expect(probe.name).toBeTruthy();
      expect(probe.category).toBeTruthy();
      expect(probe.severity).toBeTruthy();
      expect(probe.payload).toBeTruthy();
    }
  });

  it("should filter probes by category", () => {
    const promptProbes = RedTeamProbeCatalog.getProbesByCategory("prompt-injection");
    expect(promptProbes.length).toBeGreaterThanOrEqual(2);
    expect(promptProbes.every((p) => p.category === "prompt-injection")).toBe(true);

    const secretProbes = RedTeamProbeCatalog.getProbesByCategory("secret-exfiltration");
    expect(secretProbes.length).toBeGreaterThanOrEqual(2);
    expect(secretProbes.every((p) => p.category === "secret-exfiltration")).toBe(true);
  });

  it("should filter probes by severity", () => {
    const criticalProbes = RedTeamProbeCatalog.getProbesBySeverity("critical");
    expect(criticalProbes.length).toBeGreaterThan(0);
    expect(criticalProbes.every((p) => p.severity === "critical")).toBe(true);
  });

  it("should register and retrieve custom probe", () => {
    const custom: RedTeamProbe = {
      id: "probe-custom-test",
      name: "Custom Test Probe",
      category: "defense-bypass",
      severity: "low",
      description: "Custom probe for test coverage",
      vector: "instruction",
      payload: "echo 'CUSTOM_PAYLOAD_TEST'",
      vulnerabilityIndicator: {
        commandPatterns: ["CUSTOM_PAYLOAD_TEST"],
      },
    };

    RedTeamProbeCatalog.registerCustomProbe(custom);
    const retrieved = RedTeamProbeCatalog.getProbeById("probe-custom-test");
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Custom Test Probe");

    RedTeamProbeCatalog.clearCustomProbes();
    expect(RedTeamProbeCatalog.getProbeById("probe-custom-test")).toBeUndefined();
  });
});

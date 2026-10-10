import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

describe("CLI chaos Command Integration", () => {
  it("should run chaos CLI with scenario and output scorecard", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-chaos-cli-test-"));

    const scenario = {
      id: "chaos-cli-test",
      name: "Chaos Resilience Test",
      description: "Test agent resilience under injected network flakiness",
      version: "1.0.0",
      workspace: {
        cleanup: false,
        gitInit: false,
        initialFiles: {
          "README.md": "# Chaos Test Repo",
        },
      },
      task: {
        instruction: "Inspect files and verify status",
      },
      budgets: {
        maxTurns: 5,
        timeoutMs: 30000,
        maxTokens: 10000,
      },
      security: {
        allowedCommands: ["*"],
        deniedCommands: [],
      },
      assertions: {
        files: [{ path: "README.md", shouldExist: true }],
      },
    };

    const scenarioPath = path.join(tmpDir, "scenario.json");
    const jsonOutPath = path.join(tmpDir, "scorecard.json");
    await fs.writeFile(scenarioPath, JSON.stringify(scenario), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "chaos",
      "-s",
      scenarioPath,
      "-p",
      "transient-network",
      "-f",
      "json",
      "-o",
      jsonOutPath,
      "-c",
      "ls -la",
    ]);

    expect(stdout).toContain("Resilience scorecard written to");

    const jsonContent = await fs.readFile(jsonOutPath, "utf8");
    const parsed = JSON.parse(jsonContent);

    expect(parsed.profileId).toBe("transient-network-flakiness");
    expect(parsed.metrics).toBeDefined();
    expect(parsed.metrics.resilienceScore).toBeGreaterThanOrEqual(0);
    expect(["S", "A", "B", "C", "F"]).toContain(parsed.metrics.rating);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should enforce --min-score CI gate and fail when threshold is not met", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-chaos-gate-test-"));

    const scenario = {
      id: "chaos-gate-test",
      name: "Chaos Gate Test",
      version: "1.0.0",
      workspace: { cleanup: false, initialFiles: {} },
      task: { instruction: "Test gate" },
      budgets: { maxTurns: 2, timeoutMs: 10000, maxTokens: 1000 },
      security: { allowedCommands: ["*"], deniedCommands: [] },
      assertions: {},
    };

    const scenarioPath = path.join(tmpDir, "scenario.json");
    await fs.writeFile(scenarioPath, JSON.stringify(scenario), "utf8");

    // Setting an unachievable threshold of 105 should trigger process.exit(1)
    let failed = false;
    try {
      await execFileAsync("node", [
        path.resolve("dist/cli/index.js"),
        "chaos",
        "-s",
        scenarioPath,
        "-p",
        "chaos-monkey",
        "--min-score",
        "105",
      ]);
    } catch (err: any) {
      failed = true;
      expect(err.code).toBe(1);
    }

    expect(failed).toBe(true);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

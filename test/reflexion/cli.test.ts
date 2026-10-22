import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

describe("CLI reflexion Command Integration", () => {
  const sampleTrajectory = {
    scenarioId: "cli-reflexion-sample",
    startedAt: "2026-10-23T03:00:00.000Z",
    durationMs: 3000,
    status: "completed",
    summary: { totalTurns: 3, totalToolCalls: 3, totalTokens: 900, costUsd: 0.01, completed: true },
    turns: [
      {
        turnNumber: 1,
        prompt: "Run tests",
        toolCalls: [
          {
            callId: "call-1",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, output: "FAIL test/app.test.js" },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Patch the implementation",
        toolCalls: [
          {
            callId: "call-2",
            toolName: "file_write",
            arguments: { path: "src/app.js", content: "module.exports = () => true;" },
            result: { success: true },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Re-run tests",
        toolCalls: [
          {
            callId: "call-3",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: true, exitCode: 0, output: "PASS test/app.test.js" },
          },
        ],
      },
    ],
  };

  const failingTrajectory = {
    scenarioId: "cli-failing-sample",
    startedAt: "2026-10-23T03:00:00.000Z",
    durationMs: 4000,
    status: "error",
    summary: { totalTurns: 2, totalToolCalls: 2, totalTokens: 600, costUsd: 0.005, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Run test",
        toolCalls: [
          {
            callId: "call-1",
            toolName: "bash",
            arguments: { command: "pytest" },
            result: { success: false, exitCode: 1, output: "AssertionError" },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Blind retry",
        toolCalls: [
          {
            callId: "call-2",
            toolName: "bash",
            arguments: { command: "pytest" },
            result: { success: false, exitCode: 1, output: "AssertionError" },
          },
        ],
      },
    ],
  };

  it("executes reflexion CLI command and outputs markdown report & exported episodes", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-reflexion-cli-test-"));
    const trajPath = path.join(tmpDir, "trajectory.json");
    const reportPath = path.join(tmpDir, "diagnostic-report.md");
    const episodesPath = path.join(tmpDir, "episodes.json");

    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "reflexion",
      "-t",
      trajPath,
      "-f",
      "markdown",
      "-o",
      reportPath,
      "--export-episodes",
      episodesPath,
      "--min-shr",
      "0.5",
    ]);

    expect(stdout).toContain("Reflexion diagnostic report written to:");
    expect(stdout).toContain("Failure episodes exported to:");

    const reportContent = await fs.readFile(reportPath, "utf8");
    expect(reportContent).toContain("# Agent Reflexion & Self-Correction Diagnostic Report");
    expect(reportContent).toContain("cli-reflexion-sample");

    const episodesContent = await fs.readFile(episodesPath, "utf8");
    const parsedEpisodes = JSON.parse(episodesContent);
    expect(Array.isArray(parsedEpisodes)).toBe(true);
    expect(parsedEpisodes.length).toBe(1);
    expect(parsedEpisodes[0].status).toBe("recovered");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("executes reflexion CLI with comparative trajectory benchmark", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-reflexion-comp-test-"));
    const baselinePath = path.join(tmpDir, "baseline.json");
    const compPath = path.join(tmpDir, "comparative.json");

    await fs.writeFile(baselinePath, JSON.stringify(failingTrajectory), "utf8");
    await fs.writeFile(compPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "reflexion",
      "-t",
      baselinePath,
      "-c",
      compPath,
      "-f",
      "json",
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toBe("significantly_improved");
    expect(parsed.deltaSelfHealingRate).toBe(1.0);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("fails with exit code 1 when SHR is below min-shr threshold", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-reflexion-fail-test-"));
    const trajPath = path.join(tmpDir, "failing.json");
    await fs.writeFile(trajPath, JSON.stringify(failingTrajectory), "utf8");

    let failed = false;
    try {
      await execFileAsync("node", [
        path.resolve("dist/cli/index.js"),
        "reflexion",
        "-t",
        trajPath,
        "--min-shr",
        "0.8",
      ]);
    } catch (err: any) {
      failed = true;
      expect(err.code).toBe(1);
      expect(err.stderr).toContain("Self-Healing Rate (0.0%) below minimum threshold (80.0%)");
    }

    expect(failed).toBe(true);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

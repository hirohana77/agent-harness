import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

describe("CLI timetravel Command Integration", () => {
  const sampleTrajectory = {
    scenarioId: "cli-timetravel-sample",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "error",
    summary: { totalTurns: 3, totalToolCalls: 3, totalTokens: 1200, costUsd: 0.02, completed: false },
    turns: [
      {
        turnNumber: 1,
        prompt: "Create file",
        toolCalls: [
          {
            callId: "call-1",
            toolName: "file_write",
            arguments: { path: "src/calc.js", content: "function add(a, b) { return a + b; }" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Break file syntax",
        toolCalls: [
          {
            callId: "call-2",
            toolName: "bash",
            arguments: { command: "echo 'error :::' >> src/calc.js" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Run tests",
        toolCalls: [
          {
            callId: "call-3",
            toolName: "bash",
            arguments: { command: "npm test" },
            result: { success: false, exitCode: 1, error: "SyntaxError: Unexpected token" },
          },
        ],
      },
    ],
  };

  it("renders terminal report for a trajectory", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-timetravel-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "timetravel",
      "-t",
      trajPath,
    ]);

    expect(stdout).toContain("AGENT TIME-TRAVEL DEBUGGER & COUNTERFACTUAL REPORT");
    expect(stdout).toContain("cli-timetravel-sample");
    expect(stdout).toContain("Turn  1");
    expect(stdout).toContain("Turn  2");
    expect(stdout).toContain("Turn  3");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("runs automated bisect and exports json report", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-timetravel-bisect-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    const outPath = path.join(tmpDir, "report.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "timetravel",
      "-t",
      trajPath,
      "--bisect",
      "-f",
      "json",
      "-o",
      outPath,
    ]);

    expect(stdout).toContain("Time-travel report written to:");
    const fileContent = await fs.readFile(outPath, "utf8");
    const parsed = JSON.parse(fileContent);

    expect(parsed.scenarioId).toBe("cli-timetravel-sample");
    expect(parsed.bisectResult).toBeDefined();
    expect(parsed.bisectResult.firstFaultyTurn).toBe(3);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("simulates counterfactual branch via CLI flags", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-timetravel-cf-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "timetravel",
      "-t",
      trajPath,
      "--fork-turn",
      "3",
      "--override-exit-code",
      "0",
      "--override-output",
      "PASS 1 test passed",
      "-f",
      "json",
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.counterfactualBranches.length).toBe(1);
    expect(parsed.counterfactualBranches[0].forkTurn).toBe(3);
    expect(parsed.counterfactualBranches[0].outcomeDelta.statusChange).toBe("rescued");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("fails with exit code 1 when --fail-on-regression is specified and bisect locates regression", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-timetravel-fail-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    let failed = false;
    try {
      await execFileAsync("node", [
        path.resolve("dist/cli/index.js"),
        "timetravel",
        "-t",
        trajPath,
        "--bisect",
        "--fail-on-regression",
      ]);
    } catch (err: any) {
      failed = true;
      expect(err.code).toBe(1);
      expect(err.stderr).toContain("Failure regression pinpointed at Turn 3");
    }

    expect(failed).toBe(true);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

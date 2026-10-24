import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

describe("CLI causal Command Integration", () => {
  const sampleTrajectory = {
    scenarioId: "cli-causal-test-scenario",
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

  it("renders terminal report for a trajectory via CLI", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-causal-cli-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "causal",
      "-t",
      trajPath,
    ]);

    expect(stdout).toContain("CAUSAL DAG & ROOT-CAUSE ATTRIBUTION REPORT");
    expect(stdout).toContain("cli-causal-test-scenario");
    expect(stdout).toContain("Critical Path & Trajectory Efficiency");
    expect(stdout).toContain("Root-Cause Responsibility Ranking");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exports markdown report and raw causal DAG to files", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-causal-export-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    const outReportPath = path.join(tmpDir, "report.md");
    const outGraphPath = path.join(tmpDir, "graph.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "causal",
      "-t",
      trajPath,
      "-f",
      "markdown",
      "-o",
      outReportPath,
      "--export-graph",
      outGraphPath,
    ]);

    expect(stdout).toContain("Causal attribution report written to:");
    expect(stdout).toContain("Causal DAG exported to:");

    const reportContent = await fs.readFile(outReportPath, "utf8");
    expect(reportContent).toContain("# Causal DAG & Root-Cause Attribution Report");

    const graphContent = await fs.readFile(outGraphPath, "utf8");
    const parsedGraph = JSON.parse(graphContent);
    expect(parsedGraph.scenarioId).toBe("cli-causal-test-scenario");
    expect(parsedGraph.nodes).toBeDefined();
    expect(parsedGraph.edges).toBeDefined();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("fails with exit code 1 when --fail-on-root-cause is specified and root cause responsibility is high", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-causal-fail-gate-test-"));
    const trajPath = path.join(tmpDir, "sample.json");
    await fs.writeFile(trajPath, JSON.stringify(sampleTrajectory), "utf8");

    let errorCaught: any = null;
    try {
      await execFileAsync("node", [
        path.resolve("dist/cli/index.js"),
        "causal",
        "-t",
        trajPath,
        "--fail-on-root-cause",
      ]);
    } catch (err: any) {
      errorCaught = err;
    }

    expect(errorCaught).not.toBeNull();
    expect(errorCaught.code).toBe(1);
    expect(errorCaught.stderr).toContain("High-confidence root cause detected");

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

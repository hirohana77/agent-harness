import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

describe("CLI arena Command Integration", () => {
  const sampleScenario = {
    id: "cli-arena-task",
    name: "CLI Arena Sample Task",
    workspace: {
      initialFiles: {
        "index.js": 'console.log("ready");\n',
      },
      cleanup: true,
      gitInit: false,
    },
    task: {
      instruction: "Verify index.js exists and run it.",
    },
    budgets: {
      maxTurns: 5,
      timeoutMs: 10000,
      maxTokens: 5000,
    },
    security: {
      allowedCommands: ["node *", "cat *"],
      deniedCommands: ["rm -rf /"],
      allowedPaths: ["."],
      networkEnabled: false,
    },
    assertions: {
      files: [
        {
          path: "index.js",
          shouldExist: true,
        },
      ],
      commands: [],
      trajectory: [],
    },
  };

  it("executes arena CLI command and outputs markdown report & leaderboard export", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-arena-cli-test-"));

    const scenarioPath = path.join(tmpDir, "scenario.json");
    const reportPath = path.join(tmpDir, "arena-report.md");
    const leaderboardPath = path.join(tmpDir, "leaderboard.json");

    await fs.writeFile(scenarioPath, JSON.stringify(sampleScenario), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "arena",
      "-s",
      scenarioPath,
      "-a",
      "agent-claude,agent-gpt",
      "-m",
      "round-robin",
      "-f",
      "markdown",
      "-o",
      reportPath,
      "--export-leaderboard",
      leaderboardPath,
    ]);

    expect(stdout).toContain("Arena tournament report written to:");
    expect(stdout).toContain("Leaderboard exported to:");

    const reportContent = await fs.readFile(reportPath, "utf8");
    expect(reportContent).toContain("# Multi-Agent Tournament Arena Report");
    expect(reportContent).toContain("agent-claude");
    expect(reportContent).toContain("agent-gpt");

    const lbContent = await fs.readFile(leaderboardPath, "utf8");
    const parsedLb = JSON.parse(lbContent);
    expect(parsedLb).toHaveLength(2);
    expect(parsedLb[0].rating).toBeDefined();

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("outputs json arena report to stdout when no output file is specified", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-arena-json-stdout-test-"));
    const scenarioPath = path.join(tmpDir, "scenario.json");

    await fs.writeFile(scenarioPath, JSON.stringify(sampleScenario), "utf8");

    const { stdout } = await execFileAsync("node", [
      path.resolve("dist/cli/index.js"),
      "arena",
      "-s",
      scenarioPath,
      "-a",
      "agent-alpha,agent-beta",
      "-f",
      "json",
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.tournamentId).toBeDefined();
    expect(parsed.leaderboard).toHaveLength(2);
    expect(parsed.totalMatches).toBe(1);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

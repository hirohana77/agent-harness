#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import chalk from "chalk";
import { VERSION } from "../index.js";
import { ScenarioDefinitionSchema } from "../core/schemas.js";
import { AgentHarness } from "../core/harness.js";
import { TrajectoryExporter } from "../trajectory/exporter.js";
import { TerminalReporter } from "../reporters/terminal.js";
import { JsonReporter } from "../reporters/json.js";
import { MarkdownReporter } from "../reporters/markdown.js";

const program = new Command();

program
  .name("agent-harness")
  .description("Deterministic execution, sandbox evaluation, and trajectory verification harness for autonomous AI agents")
  .version(VERSION);

// Helper to load scenario file (supports JSON and YAML)
async function loadScenario(filePath: string) {
  const resolved = path.resolve(filePath);
  const raw = await fs.readFile(resolved, "utf8");
  let parsed: any;
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    parsed = yaml.parse(raw);
  } else {
    parsed = JSON.parse(raw);
  }
  return ScenarioDefinitionSchema.parse(parsed);
}

// 1. validate command
program
  .command("validate")
  .description("Validate a scenario YAML or JSON against the schema")
  .requiredOption("-s, --scenario <path>", "Path to scenario file")
  .action(async (options) => {
    try {
      const scenario = await loadScenario(options.scenario);
      console.log(chalk.green("✔ Scenario is valid:"), chalk.bold(scenario.name || scenario.id));
      console.log(chalk.gray(`  ID: ${scenario.id}`));
      console.log(chalk.gray(`  Task: ${scenario.task.instruction.slice(0, 80)}...`));
    } catch (err: any) {
      console.error(chalk.red("✘ Scenario validation failed:"), err.message);
      process.exit(1);
    }
  });

// 2. init command
program
  .command("init")
  .description("Scaffold a new scenario template")
  .option("-o, --output <path>", "Output file path", "scenario.yaml")
  .action(async (options) => {
    try {
      const template = {
        id: "sample-bug-fix",
        name: "Fix Null Pointer in Calculator",
        description: "Agent must identify and fix a null pointer bug in add() method and run tests",
        version: "1.0.0",
        workspace: {
          cleanup: false,
          gitInit: true,
          initialFiles: {
            "src/calc.js": "function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n",
            "test/calc.test.js": "const { add } = require('../src/calc');\nif (add(2, 3) !== 5) throw new Error('Failed');\nconsole.log('Tests passed!');\n",
            "package.json": "{\n  \"name\": \"sample-calc\",\n  \"scripts\": { \"test\": \"node test/calc.test.js\" }\n}\n"
          }
        },
        task: {
          instruction: "Run the tests, ensure safe inputs, and write a README.md documenting the calc module."
        },
        budgets: {
          maxTurns: 10,
          timeoutMs: 60000,
          maxTokens: 50000
        },
        security: {
          allowedCommands: ["node *", "npm *", "cat *", "ls *"],
          deniedCommands: ["rm -rf /", "curl *"]
        },
        assertions: {
          files: [
            {
              path: "README.md",
              shouldExist: true,
              contains: "calc"
            }
          ],
          commands: [
            {
              name: "Run test suite",
              command: "npm test",
              expectedExitCode: 0,
              stdoutContains: "Tests passed!"
            }
          ],
          trajectory: [
            {
              rule: "max_turns",
              param: 10
            },
            {
              rule: "no_security_violations"
            }
          ]
        }
      };

      const outPath = path.resolve(options.output);
      await fs.writeFile(outPath, yaml.stringify(template), "utf8");
      console.log(chalk.green("✔ Generated template scenario at:"), chalk.bold(outPath));
    } catch (err: any) {
      console.error(chalk.red("✘ Failed to init template:"), err.message);
      process.exit(1);
    }
  });

// 3. replay command
program
  .command("replay")
  .description("Deterministically replay a recorded trajectory against a scenario")
  .requiredOption("-s, --scenario <path>", "Path to scenario file")
  .requiredOption("-t, --trajectory <path>", "Path to trajectory file")
  .option("--report-json <path>", "Save report to JSON file")
  .option("--report-md <path>", "Save report to Markdown file")
  .action(async (options) => {
    try {
      const scenario = await loadScenario(options.scenario);
      const trajectory = await TrajectoryExporter.loadFromFile(options.trajectory);

      console.log(chalk.cyan(`Replaying trajectory for scenario: ${scenario.name}`));
      const { report } = await AgentHarness.replayScenario(scenario, trajectory);

      TerminalReporter.print(report);

      if (options.reportJson) {
        await JsonReporter.save(report, options.reportJson);
        console.log(chalk.gray(`JSON report saved to: ${options.reportJson}`));
      }
      if (options.reportMd) {
        await MarkdownReporter.save(report, options.reportMd);
        console.log(chalk.gray(`Markdown report saved to: ${options.reportMd}`));
      }

      if (!report.passed) {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Replay failed:"), err.message);
      process.exit(1);
    }
  });

// 4. run command (with a shell agent or script command)
program
  .command("run")
  .description("Run a scenario using a shell script/agent command")
  .requiredOption("-s, --scenario <path>", "Path to scenario file")
  .option("-c, --command <agentCmd>", "Agent command to execute inside workspace (e.g., codex exec, custom script)")
  .option("--report-json <path>", "Save report to JSON file")
  .option("--report-md <path>", "Save report to Markdown file")
  .option("--save-trajectory <path>", "Save generated trajectory to file")
  .action(async (options) => {
    try {
      const scenario = await loadScenario(options.scenario);
      console.log(chalk.cyan(`Starting scenario run: ${scenario.name}`));

      const { report, trajectory } = await AgentHarness.runScenario(scenario, async (ctx) => {
        ctx.recorder.startTurn(scenario.task.instruction, "Starting automated execution");

        if (options.command) {
          const tStart = Date.now();
          const result = await ctx.executor.execute(options.command);
          ctx.recorder.recordToolCall(
            "bash",
            { command: options.command },
            {
              success: result.success,
              output: result.output,
              error: result.error,
              exitCode: result.exitCode,
            },
            Date.now() - tStart
          );
        }

        ctx.recorder.completeTurn("Scenario run completed", {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        });
      });

      TerminalReporter.print(report);

      if (options.saveTrajectory) {
        await TrajectoryExporter.saveToFile(trajectory, options.saveTrajectory);
        console.log(chalk.gray(`Trajectory saved to: ${options.saveTrajectory}`));
      }
      if (options.reportJson) {
        await JsonReporter.save(report, options.reportJson);
        console.log(chalk.gray(`JSON report saved to: ${options.reportJson}`));
      }
      if (options.reportMd) {
        await MarkdownReporter.save(report, options.reportMd);
        console.log(chalk.gray(`Markdown report saved to: ${options.reportMd}`));
      }

      if (!report.passed) {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Scenario run failed:"), err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

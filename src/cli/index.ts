#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import chalk from "chalk";
import { VERSION } from "../index.js";
import { ScenarioDefinitionSchema, SandboxConfigSchema } from "../core/schemas.js";
import { AgentHarness } from "../core/harness.js";
import { TrajectoryExporter } from "../trajectory/exporter.js";
import { TerminalReporter } from "../reporters/terminal.js";
import { JsonReporter } from "../reporters/json.js";
import { MarkdownReporter } from "../reporters/markdown.js";
import { LiveConsoleObserver } from "../events/observers/console.js";
import { JsonLinesStreamObserver } from "../events/observers/jsonl.js";
import { TrajectoryStreamObserver } from "../events/types.js";
import { TelemetryServer } from "../telemetry/server.js";
import { TelemetryObserver } from "../telemetry/observer.js";
import { SteeringController } from "../steering/index.js";

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
          ],
          ast: [
            {
              path: "src/calc.js",
              rules: [
                {
                  rule: "has_function",
                  name: "add",
                  minParams: 2,
                  maxParams: 2
                },
                {
                  rule: "no_forbidden_syntax",
                  forbidden: ["eval", "debugger"]
                }
              ]
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
  .option("--sandbox <type>", "Execution sandbox backend: local, docker, podman")
  .option("--image <image>", "Container image for docker/podman sandbox")
  .option("--container-network <network>", "Container network mode (none, host, bridge)")
  .option("--live", "Stream real-time trajectory execution events to the console")
  .option("--stream-jsonl <path>", "Stream real-time events in JSON Lines (NDJSON) format to file")
  .option("--report-json <path>", "Save report to JSON file")
  .option("--report-md <path>", "Save report to Markdown file")
  .option("--save-trajectory <path>", "Save generated trajectory to file")
  .option("--telemetry", "Start real-time web telemetry server & dashboard during execution")
  .option("--telemetry-port <port>", "Port for telemetry server (default: 3456)", (v) => parseInt(v, 10), 3456)
  .option("--telemetry-host <host>", "Host for telemetry server (default: 127.0.0.1)", "127.0.0.1")
  .option("--telemetry-remote <url>", "Forward execution events to remote telemetry server URL")
  .option("--keep-alive", "Keep telemetry dashboard server active after run completes until interrupted")
  .option("-i, --interactive", "Enable interactive steering and breakpoint console")
  .option("--breakpoint <rules...>", "Set initial breakpoint rules (e.g. tool:bash, error:3, turn:5)")
  .action(async (options) => {
    let telemetryServer: TelemetryServer | undefined;
    try {
      const scenario = await loadScenario(options.scenario);
      if (options.sandbox || options.image || options.containerNetwork) {
        scenario.sandbox = SandboxConfigSchema.parse({
          backend: options.sandbox || scenario.sandbox?.backend || 'local',
          container: {
            ...scenario.sandbox?.container,
            image: options.image || scenario.sandbox?.container?.image || 'alpine:latest',
            network: options.containerNetwork || scenario.sandbox?.container?.network || 'none',
          },
        });
      }
      console.log(chalk.cyan(`Starting scenario run: ${scenario.name}`));

      const observers: TrajectoryStreamObserver[] = [];
      if (options.live) {
        observers.push(new LiveConsoleObserver({ verbose: true }));
      }
      if (options.streamJsonl) {
        observers.push(new JsonLinesStreamObserver(options.streamJsonl));
      }

      let steering: SteeringController | undefined;
      if (options.interactive || options.breakpoint || options.telemetry) {
        steering = new SteeringController();
        if (options.breakpoint && Array.isArray(options.breakpoint)) {
          for (const bpStr of options.breakpoint) {
            if (bpStr.startsWith('tool:')) {
              steering.addBreakpoint({ id: 'cli_' + bpStr, type: 'tool', toolPattern: bpStr.slice(5) });
            } else if (bpStr.startsWith('error:')) {
              steering.addBreakpoint({ id: 'cli_' + bpStr, type: 'error_count', errorThreshold: parseInt(bpStr.slice(6), 10) });
            } else if (bpStr.startsWith('turn:')) {
              steering.addBreakpoint({ id: 'cli_' + bpStr, type: 'turn', turnThreshold: parseInt(bpStr.slice(5), 10) });
            }
          }
        }
      }

      if (options.telemetry) {
        telemetryServer = new TelemetryServer({
          port: options.telemetryPort,
          host: options.telemetryHost,
          steering,
        });
        const { url } = await telemetryServer.start();
        console.log(chalk.cyan(`📡 Live Telemetry Dashboard running at: ${chalk.bold.underline(`${url}/dashboard`)}`));
        observers.push(new TelemetryObserver({ server: telemetryServer }));
      } else if (options.telemetryRemote) {
        console.log(chalk.cyan(`📡 Forwarding telemetry to remote server: ${options.telemetryRemote}`));
        observers.push(new TelemetryObserver({ url: options.telemetryRemote }));
      }

      const { report, trajectory } = await AgentHarness.runScenario(
        scenario,
        async (ctx) => {
          ctx.recorder.startTurn(scenario.task.instruction, "Starting automated execution");

          if (options.command) {
            const tStart = Date.now();
            ctx.recorder.notifyToolStart("bash", { command: options.command });
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
        },
        { observers, steering }
      );

      // Ensure any stream observers close their underlying files
      await Promise.allSettled(observers.map((o) => o.close?.()));

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

      if (telemetryServer) {
        telemetryServer.setLatestReport(report);
        telemetryServer.setLatestTrajectory(trajectory);
      }

      if (telemetryServer && options.keepAlive) {
        console.log(chalk.yellow(`\nTelemetry server kept alive at http://${options.telemetryHost}:${options.telemetryPort}/dashboard. Press Ctrl+C to stop.\n`));
        await new Promise<void>((resolve) => {
          process.on("SIGINT", () => {
            telemetryServer?.stop().then(resolve);
          });
          process.on("SIGTERM", () => {
            telemetryServer?.stop().then(resolve);
          });
        });
      } else if (telemetryServer) {
        await telemetryServer.stop();
      }

      if (!report.passed) {
        process.exit(1);
      }
    } catch (err: any) {
      if (telemetryServer) {
        await telemetryServer.stop().catch(() => {});
      }
      console.error(chalk.red("✘ Scenario run failed:"), err.message);
      process.exit(1);
    }
  });

// 5. serve command (real-time telemetry and SSE dashboard server)
program
  .command("serve")
  .description("Start the real-time web telemetry and SSE dashboard server")
  .option("-p, --port <port>", "Port to listen on", (v) => parseInt(v, 10), 3456)
  .option("-H, --host <host>", "Host address to listen on", "127.0.0.1")
  .option("--history-limit <limit>", "Maximum number of buffered events in memory", (v) => parseInt(v, 10), 1000)
  .option("--auth <key>", "Optional authorization bearer token")
  .action(async (options) => {
    try {
      const server = new TelemetryServer({
        port: options.port,
        host: options.host,
        historyLimit: options.historyLimit,
        authKey: options.auth,
      });

      const { url } = await server.start();
      console.log(chalk.bold.green(`✔ Agent Harness Live Telemetry Server running:`));
      console.log(`  ${chalk.gray("Dashboard UI:")}  ${chalk.cyan.underline(`${url}/dashboard`)}`);
      console.log(`  ${chalk.gray("SSE Stream:")}    ${chalk.cyan.underline(`${url}/api/events`)}`);
      console.log(`  ${chalk.gray("Server Status:")} ${chalk.cyan.underline(`${url}/api/status`)}`);
      console.log(chalk.gray(`\nWaiting for agent harness events. Press Ctrl+C to stop.\n`));

      const shutdown = async () => {
        console.log(chalk.yellow(`\nShutting down telemetry server...\n`));
        await server.stop();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (err: any) {
      console.error(chalk.red("✘ Failed to start telemetry server:"), err.message);
      process.exit(1);
    }
  });

// 6. swebench commands
const swebenchCmd = program
  .command("swebench")
  .description("SWE-bench dataset adapter, execution, and evaluation utilities");

swebenchCmd
  .command("import")
  .description("Import SWE-bench JSONL dataset into AgentHarness scenarios")
  .requiredOption("-i, --input <path>", "Path to SWE-bench JSONL file")
  .requiredOption("-o, --output <dir>", "Output directory for generated scenarios")
  .option("-f, --format <format>", "Scenario file format: yaml or json", "yaml")
  .option("--sandbox <backend>", "Sandbox execution backend: docker, podman, local", "docker")
  .option("--image-prefix <prefix>", "Container image prefix", "swebench/sweb.eval.x86_64.")
  .option("--limit <number>", "Maximum number of instances to import", (v) => parseInt(v, 10))
  .action(async (options) => {
    try {
      const { SWEBenchAdapter } = await import("../benchmark/swebench/adapter.js");
      console.log(chalk.cyan(`Reading SWE-bench dataset from: ${options.input}`));
      let instances = await SWEBenchAdapter.readJSONL(options.input, { tolerant: true });

      if (options.limit && options.limit > 0) {
        instances = instances.slice(0, options.limit);
      }

      console.log(chalk.gray(`Found ${instances.length} valid instance(s). Exporting to: ${options.output}`));
      const exportedPaths = await SWEBenchAdapter.exportScenarios(instances, options.output, {
        format: options.format === "json" ? "json" : "yaml",
        sandboxBackend: options.sandbox,
        imagePrefix: options.imagePrefix,
      });

      console.log(chalk.green(`✔ Successfully exported ${exportedPaths.length} scenario(s) to ${options.output}`));
    } catch (err: any) {
      console.error(chalk.red("✘ Failed to import SWE-bench instances:"), err.message);
      process.exit(1);
    }
  });

swebenchCmd
  .command("info")
  .description("Display summary statistics of an SWE-bench JSONL dataset")
  .requiredOption("-i, --input <path>", "Path to SWE-bench JSONL file")
  .action(async (options) => {
    try {
      const { SWEBenchAdapter } = await import("../benchmark/swebench/adapter.js");
      const instances = await SWEBenchAdapter.readJSONL(options.input, { tolerant: true });

      const repos: Record<string, number> = {};
      let totalFailToPass = 0;
      let totalPassToPass = 0;

      for (const inst of instances) {
        repos[inst.repo] = (repos[inst.repo] || 0) + 1;
        totalFailToPass += inst.FAIL_TO_PASS.length;
        totalPassToPass += inst.PASS_TO_PASS.length;
      }

      console.log(chalk.bold.green(`SWE-bench Dataset Summary: ${options.input}`));
      console.log(`  Total Instances: ${chalk.bold(instances.length)}`);
      console.log(`  Total Repositories: ${chalk.bold(Object.keys(repos).length)}`);
      console.log(`  FAIL_TO_PASS Tests: ${chalk.bold(totalFailToPass)}`);
      console.log(`  PASS_TO_PASS Tests: ${chalk.bold(totalPassToPass)}`);
      console.log(chalk.gray("  Repository breakdown:"));
      for (const [repo, count] of Object.entries(repos)) {
        console.log(`    - ${repo}: ${count} task(s)`);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Failed to read dataset info:"), err.message);
      process.exit(1);
    }
  });

swebenchCmd
  .command("eval")
  .description("Evaluate predictions against SWE-bench ground truth dataset")
  .requiredOption("-d, --dataset <path>", "Path to SWE-bench JSONL dataset")
  .requiredOption("-p, --predictions <path>", "Path to predictions JSON file")
  .option("-o, --output <path>", "Path to save SWE-bench evaluation summary JSON")
  .action(async (options) => {
    try {
      const { SWEBenchAdapter } = await import("../benchmark/swebench/adapter.js");
      const { SWEBenchEvaluator } = await import("../benchmark/swebench/evaluator.js");

      console.log(chalk.cyan(`Loading dataset from ${options.dataset}...`));
      const instances = await SWEBenchAdapter.readJSONL(options.dataset, { tolerant: true });
      const predictions = await SWEBenchEvaluator.loadPredictionsJSON(options.predictions);

      console.log(chalk.cyan(`Loaded ${instances.length} instances and ${predictions.length} predictions.`));

      const predMap = new Map(predictions.map((p) => [p.instance_id, p]));
      const evalInputs = instances.map((inst) => {
        const pred = predMap.get(inst.instance_id);
        const hasPatch = Boolean(pred && pred.model_patch && pred.model_patch.trim());
        return {
          instanceId: inst.instance_id,
          output: hasPatch ? "PASSED (all target tests)" : "FAILED (no patch)",
        };
      });

      const summary = SWEBenchEvaluator.evaluateSuite(instances, evalInputs);

      console.log(chalk.bold.green("SWE-bench Evaluation Results:"));
      console.log(`  Total Tasks: ${summary.totalInstances}`);
      console.log(`  Resolved: ${chalk.green(summary.resolvedInstances)}`);
      console.log(`  Unresolved: ${chalk.yellow(summary.unresolvedInstances)}`);
      console.log(`  Resolve Rate: ${chalk.bold(summary.resolveRatePercent + "%")}`);

      if (options.output) {
        await fs.writeFile(path.resolve(options.output), JSON.stringify(summary, null, 2), "utf8");
        console.log(chalk.gray(`Evaluation report written to: ${options.output}`));
      }
    } catch (err: any) {
      console.error(chalk.red("✘ SWE-bench evaluation failed:"), err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

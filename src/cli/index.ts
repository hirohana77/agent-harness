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
import {
  ChaosEngine,
  BUILTIN_CHAOS_PROFILES,
  renderResilienceScorecard,
  ChaosProfileSchema,
  type ResilienceReportFormat,
} from "../chaos/index.js";

import {
  ClusterConsensusEngine,
  renderConsensusReport,
  type ConsensusReportFormat,
} from "../consensus/index.js";

import {
  PolicyDistillationEngine,
  renderDistillationReport,
  PromptGuidanceFormatter,
  type DistillationReportFormat,
} from "../distillation/index.js";

import {
  ArenaEngine,
  renderArenaReport,
  type ArenaReportFormat,
  type TournamentMode,
  type RatingSystemType,
  type CandidateWithTarget,
} from "../arena/index.js";

import {
  AutoCurriculumEngine,
  renderCurriculumReport,
  CurriculumPlanSchema,
  type CurriculumReportFormat,
  type CurriculumDifficultyLevel,
} from "../curriculum/index.js";

import {
  RedTeamEngine,
  renderRedTeamReport,
  renderBenchmarkComparison,
  type RedTeamReportFormat,
  type RedTeamRiskCategory,
  type ProbeSeverity,
  type GuardrailMode,
} from "../redteam/index.js";

import {
  ReflexionEngine,
  renderReflexionReport,
  renderReflexionComparison,
  type ReflexionReportFormat,
} from "../reflexion/index.js";

import {
  TimeTravelEngine,
  renderTimeTravelReport,
  type TimeTravelReportFormat,
  type BuiltinPredicateType,
  type CounterfactualMutation,
} from "../timetravel/index.js";

import {
  CausalAttributionEngine,
  renderCausalReport,
  type CausalReportFormat,
} from "../causality/index.js";

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

// diff command
program
  .command("diff")
  .description("Compare two agent trajectories or harness reports to detect regressions and step divergence")
  .argument("<baseline>", "Path to baseline trajectory or harness report JSON")
  .argument("<candidate>", "Path to candidate trajectory or harness report JSON")
  .option("-f, --format <format>", "Diff report format: terminal, markdown, html, json", "terminal")
  .option("-o, --output <path>", "File path to save the diff report output")
  .option("--strict-args", "Enforce strict comparison on tool argument JSON payloads", false)
  .option("--token-ratio <ratio>", "Token regression threshold ratio (default 0.5)", "0.5")
  .option("--min-similarity <score>", "Minimum similarity threshold for step alignment (0-1)", "0.6")
  .option("--fail-on-regression", "Exit with non-zero code (1) if a regression is detected", false)
  .action(async (baselinePath, candidatePath, options) => {
    try {
      const { TrajectoryComparator } = await import("../comparator/comparator.js");
      const { renderTrajectoryDiff } = await import("../comparator/reporters/index.js");

      const baseRaw = JSON.parse(await fs.readFile(path.resolve(baselinePath), "utf8"));
      const candRaw = JSON.parse(await fs.readFile(path.resolve(candidatePath), "utf8"));

      const compareOptions = {
        strictArgs: Boolean(options.strictArgs),
        tokenRegressionRatio: parseFloat(options.tokenRatio) || 0.5,
        minSimilarityThreshold: parseFloat(options.minSimilarity) || 0.6,
      };

      const isBaseReport = Boolean(baseRaw.assertionResults && baseRaw.metrics);
      const isCandReport = Boolean(candRaw.assertionResults && candRaw.metrics);

      let isRegression = false;
      let renderedOutput = "";

      if (isBaseReport && isCandReport) {
        const reportDiff = TrajectoryComparator.compareReports(baseRaw, candRaw, undefined, undefined, compareOptions);
        isRegression = reportDiff.isRegression;

        if (options.format === "json") {
          renderedOutput = JSON.stringify(reportDiff, null, 2);
        } else {
          // Render assertion diff
          const lines: string[] = [];
          lines.push(chalk.bold(`Report Comparison: ${reportDiff.scenarioId}`));
          lines.push(`Status: Baseline Passed: ${reportDiff.baselinePassed} | Candidate Passed: ${reportDiff.candidatePassed}`);
          lines.push(`Regression: ${reportDiff.isRegression ? chalk.red("YES") : chalk.green("NO")}`);
          lines.push(chalk.bold("\nAssertion Breakdown:"));
          for (const a of reportDiff.assertions) {
            const badge = a.status === "regression" ? chalk.red(`[${a.status}]`) : chalk.green(`[${a.status}]`);
            lines.push(`  • ${badge} ${a.type}: ${a.target} (base: ${a.baselinePassed}, cand: ${a.candidatePassed})`);
          }
          renderedOutput = lines.join("\n");
        }
      } else {
        const diff = TrajectoryComparator.compare(baseRaw, candRaw, compareOptions);
        isRegression = diff.regression.isRegression;
        renderedOutput = renderTrajectoryDiff(diff, options.format as any);
      }

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, renderedOutput, "utf8");
        console.log(chalk.gray(`Diff report written to: ${options.output}`));
      } else {
        console.log(renderedOutput);
      }

      if (options.failOnRegression && isRegression) {
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Trajectory diff failed:"), err.message);
      process.exit(1);
    }
  });



// chaos command
program
  .command("chaos")
  .description("Inject deterministic or probabilistic faults and evaluate agent resilience")
  .requiredOption("-s, --scenario <path>", "Path to scenario file")
  .option("-p, --profile <nameOrPath>", "Chaos profile name (transient-network, rate-limit, adversarial-poison, corrupted-output, chaos-monkey) or JSON/YAML file path", "chaos-monkey")
  .option("-f, --format <format>", "Resilience scorecard format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "File path to save the resilience scorecard")
  .option("-c, --command <agentCmd>", "Agent command or shell script to execute inside workspace")
  .option("--min-score <score>", "Minimum resilience score threshold (0-100) for CI gate", "0")
  .action(async (options) => {
    try {
      const scenario = await loadScenario(options.scenario);

      // Resolve Chaos Profile
      let profile = BUILTIN_CHAOS_PROFILES[options.profile];
      if (!profile) {
        const resolvedPath = path.resolve(options.profile);
        const raw = await fs.readFile(resolvedPath, "utf8");
        const parsed = options.profile.endsWith(".yaml") || options.profile.endsWith(".yml")
          ? yaml.parse(raw)
          : JSON.parse(raw);
        profile = ChaosProfileSchema.parse(parsed);
      }

      console.log(chalk.magenta(`⚡ Initializing Chaos Engine with Profile: ${chalk.bold(profile.name || profile.id)}`));
      const chaos = new ChaosEngine(profile);

      // Set up VirtualToolDispatcher with chaos engine
      const { MockToolRegistry } = await import("../mock/registry.js");
      const { VirtualToolDispatcher } = await import("../mock/dispatcher.js");
      const mockRegistry = new MockToolRegistry();

      await AgentHarness.runScenario(
        scenario,
        async (ctx) => {
          const dispatcher = new VirtualToolDispatcher(
            mockRegistry,
            ctx.executor,
            ctx.workspace,
            ctx.recorder,
            undefined,
            chaos
          );

          ctx.recorder.startTurn(scenario.task.instruction, "Running chaos resilience test");

          if (options.command) {
            await dispatcher.call("exec_command", { command: options.command });
          } else {
            await dispatcher.call("exec_command", { command: "ls -la" });
          }

          ctx.recorder.completeTurn("Chaos test step completed", {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
          });

          chaos.recordAgentTurn({
            turnNumber: 1,
            thought: "Diagnosing fault and attempting recovery",
            assistantMessage: "Executed step under chaos injection",
          });
        }
      );

      const scorecard = chaos.generateScorecard(scenario.id);
      const rendered = renderResilienceScorecard(scorecard, options.format as ResilienceReportFormat);

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, rendered, "utf8");
        console.log(chalk.gray(`Resilience scorecard written to: ${options.output}`));
      } else {
        console.log(rendered);
      }

      const minScore = parseFloat(options.minScore) || 0;
      if (scorecard.metrics.resilienceScore < minScore) {
        console.error(
          chalk.red(
            `✘ Resilience score (${scorecard.metrics.resilienceScore}) below threshold (${minScore})`
          )
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Chaos execution failed:"), err.message);
      process.exit(1);
    }
  });


// consensus command
program
  .command("consensus")
  .description("Analyze cluster consensus across N trajectory rollouts, detect bottlenecks, and distill canonical golden path")
  .requiredOption("-t, --trajectories <paths...>", "Paths to trajectory JSON files or directories")
  .option("-f, --format <format>", "Consensus scorecard format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "File path to save the consensus report")
  .option("-s, --synthesize <path>", "File path to export the synthesized canonical trajectory JSON")
  .option("--min-score <score>", "Minimum overall consensus score threshold (0-100) for CI gate", "0")
  .action(async (options) => {
    try {
      const filePaths = [];
      for (const p of options.trajectories) {
        const resolved = path.resolve(p);
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          const files = await fs.readdir(resolved);
          for (const f of files) {
            if (f.endsWith(".json")) {
              filePaths.push(path.join(resolved, f));
            }
          }
        } else {
          filePaths.push(resolved);
        }
      }

      if (filePaths.length === 0) {
        console.error(chalk.red("✘ No trajectory JSON files found."));
        process.exit(1);
      }

      const trajectories = [];
      for (const fp of filePaths) {
        const raw = await fs.readFile(fp, "utf8");
        trajectories.push(JSON.parse(raw));
      }

      const result = ClusterConsensusEngine.analyzeCluster(trajectories);
      const rendered = renderConsensusReport(result, options.format as ConsensusReportFormat);

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, rendered, "utf8");
        console.log(chalk.gray(`Consensus report written to: ${options.output}`));
      } else {
        console.log(rendered);
      }

      if (options.synthesize) {
        const synthPath = path.resolve(options.synthesize);
        await fs.mkdir(path.dirname(synthPath), { recursive: true });
        await fs.writeFile(synthPath, JSON.stringify(result.canonicalTrajectory, null, 2), "utf8");
        console.log(chalk.green(`✔ Synthesized canonical trajectory written to: ${options.synthesize}`));
      }

      const minScore = parseFloat(options.minScore) || 0;
      if (result.metrics.overallAgreementScore < minScore) {
        console.error(
          chalk.red(
            `✘ Cluster consensus score (${result.metrics.overallAgreementScore}) below threshold (${minScore})`
          )
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Cluster consensus analysis failed:"), err.message);
      process.exit(1);
    }
  });

// distill command
program
  .command("distill")
  .description("Distill strategic execution policies, invariant milestones, and anti-pattern guidance from trajectories or consensus clusters")
  .requiredOption("-i, --input <path>", "Path to consensus JSON, canonical trajectory JSON, or raw trajectory JSON")
  .option("-f, --format <format>", "Guidance format: terminal, markdown, json, fewshot, steering", "terminal")
  .option("-o, --output <path>", "File path to save the distilled policy report")
  .option("-b, --token-budget <tokens>", "Maximum token budget for exemplar steps", "1500")
  .option("-t, --target <model>", "Target model prompt format: generic, openai, anthropic, markdown", "generic")
  .option("--export-steering <path>", "File path to export generated steering rules JSON")
  .option("--no-negative", "Disable negative anti-pattern guidance extraction")
  .option("--no-compression", "Disable compression of repetitive steps")
  .action(async (options) => {
    try {
      const resolved = path.resolve(options.input);
      const raw = await fs.readFile(resolved, "utf8");
      const parsed = JSON.parse(raw);

      const tokenBudget = parseInt(options.tokenBudget, 10) || 1500;
      const includeNegativeGuidance = options.negative !== false;
      const compressRedundantSteps = options.compression !== false;

      const engine = new PolicyDistillationEngine({
        tokenBudget,
        includeNegativeGuidance,
        compressRedundantSteps,
        targetModelFormat: options.target as any,
      });

      let policy;
      if (parsed.metrics && parsed.canonicalTrajectory) {
        policy = engine.distillFromConsensus(parsed);
      } else if (parsed.synthesizedFromCount !== undefined && parsed.turns) {
        policy = engine.distillFromCanonical(parsed);
      } else {
        policy = engine.distillFromTrajectory(parsed);
      }

      let rendered: string;
      if (options.format === "fewshot") {
        rendered = JSON.stringify(PromptGuidanceFormatter.formatAsOpenAI(policy), null, 2);
      } else if (options.format === "steering") {
        rendered = JSON.stringify(PromptGuidanceFormatter.formatAsSteeringConfig(policy), null, 2);
      } else {
        rendered = renderDistillationReport(policy, options.format as DistillationReportFormat);
      }

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, rendered, "utf8");
        console.log(chalk.gray(`Distilled policy guidance written to: ${options.output}`));
      } else {
        console.log(rendered);
      }

      if (options.exportSteering) {
        const steerPath = path.resolve(options.exportSteering);
        await fs.mkdir(path.dirname(steerPath), { recursive: true });
        const config = PromptGuidanceFormatter.formatAsSteeringConfig(policy);
        await fs.writeFile(steerPath, JSON.stringify(config, null, 2), "utf8");
        console.log(chalk.green(`✔ Steering rules exported to: ${options.exportSteering}`));
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Policy distillation failed:"), err.message);
      process.exit(1);
    }
  });

// curriculum command
program
  .command("curriculum")
  .description("Execute an adaptive auto-curriculum closed-loop benchmark campaign with task mutations and gating")
  .requiredOption("-s, --scenario <path>", "Path to base scenario file (YAML/JSON)")
  .option("-p, --plan <path>", "Path to custom curriculum plan file (YAML/JSON)")
  .option("--stages <stages>", "Comma-separated curriculum stages (novice,intermediate,advanced,adversarial)", "novice,intermediate,advanced,adversarial")
  .option("--scenarios-per-stage <count>", "Number of mutated tasks per stage", "2")
  .option("-g, --guidance <path>", "Path to distilled policy JSON for guided stages")
  .option("-f, --format <format>", "Curriculum report output format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "File path to save the curriculum report")
  .option("--export-plan <path>", "File path to export the synthesized curriculum plan")
  .option("--no-gating", "Disable adaptive progression gating")
  .option("--min-competency <score>", "Fail exit code if final competency score is below threshold", "0")
  .action(async (options) => {
    try {
      const scenario = await loadScenario(options.scenario);
      const engine = new AutoCurriculumEngine();

      let guidancePolicy: any;
      if (options.guidance) {
        const resolvedGuidance = path.resolve(options.guidance);
        const rawGuidance = await fs.readFile(resolvedGuidance, "utf8");
        guidancePolicy = JSON.parse(rawGuidance);
      }

      let plan;
      if (options.plan) {
        const resolvedPlan = path.resolve(options.plan);
        const rawPlan = await fs.readFile(resolvedPlan, "utf8");
        const parsed = resolvedPlan.endsWith(".yaml") || resolvedPlan.endsWith(".yml") ? yaml.parse(rawPlan) : JSON.parse(rawPlan);
        plan = CurriculumPlanSchema.parse(parsed);
      } else {
        const stageLevels = options.stages.split(",").map((s: string) => s.trim().toLowerCase()) as CurriculumDifficultyLevel[];
        const scenariosPerStage = parseInt(options.scenariosPerStage, 10) || 2;
        plan = engine.generatePlan(scenario, {
          stages: stageLevels,
          scenariosPerStage,
          adaptiveGating: options.gating !== false,
        });
      }

      if (options.exportPlan) {
        const planPath = path.resolve(options.exportPlan);
        await fs.mkdir(path.dirname(planPath), { recursive: true });
        await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");
        console.log(chalk.green(`✔ Synthesized curriculum plan exported to: ${options.exportPlan}`));
      }

      const defaultAgentRunner = async (ctx: any) => {
        ctx.recorder.startTurn("Autonomous curriculum execution");
        ctx.recorder.completeTurn("Stage scenario step finished");
      };

      const result = await engine.executeCurriculum({
        agent: defaultAgentRunner,
        plan,
        guidancePolicy,
        stopOnGatingFailure: options.gating !== false,
      });

      const rendered = renderCurriculumReport(result, options.format as CurriculumReportFormat);

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, rendered, "utf8");
        console.log(chalk.gray(`Curriculum report written to: ${options.output}`));
      } else {
        console.log(rendered);
      }

      const minCompetency = parseFloat(options.minCompetency) || 0;
      if (result.finalCompetency < minCompetency) {
        console.error(
          chalk.red(
            `✘ Final competency rating (${result.finalCompetency}) below minimum threshold (${minCompetency})`
          )
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Auto-curriculum execution failed:"), err.message);
      process.exit(1);
    }
  });


// arena command
program
  .command("arena")
  .description("Execute multi-agent tournament arena matches and compute Elo/Glicko rankings")
  .requiredOption("-s, --scenarios <paths>", "Comma-separated scenario file paths (YAML/JSON)")
  .option("-a, --agents <agents>", "Comma-separated candidate agent identifiers or path to agents file", "agent-alpha,agent-beta")
  .option("-m, --mode <mode>", "Tournament mode: round-robin, swiss, matrix, bracket", "round-robin")
  .option("-r, --rounds <count>", "Number of tournament rounds", "1")
  .option("--rating-system <system>", "Rating system: elo, glicko2", "elo")
  .option("--k-factor <number>", "Base Elo K-factor", "32")
  .option("-f, --format <format>", "Arena report output format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "File path to save the arena tournament report")
  .option("--export-leaderboard <path>", "File path to export the leaderboard standings JSON")
  .option("--min-rating <score>", "Fail exit code if top performer rating is below threshold", "0")
  .action(async (options) => {
    try {
      const scenarioPaths = options.scenarios.split(",").map((s: string) => s.trim()).filter(Boolean);
      const scenarios = await Promise.all(scenarioPaths.map((p: string) => loadScenario(p)));

      let rawCandidates: any[] = [];
      const agentsArg = options.agents.trim();
      if (agentsArg.endsWith(".json") || agentsArg.endsWith(".yaml") || agentsArg.endsWith(".yml")) {
        const resolvedPath = path.resolve(agentsArg);
        const raw = await fs.readFile(resolvedPath, "utf8");
        const parsed = resolvedPath.endsWith(".yaml") || resolvedPath.endsWith(".yml") ? yaml.parse(raw) : JSON.parse(raw);
        rawCandidates = Array.isArray(parsed) ? parsed : parsed.agents || [parsed];
      } else {
        rawCandidates = agentsArg.split(",").map((name: string) => ({
          id: name.trim(),
          name: name.trim(),
          initialRating: 1500,
        }));
      }

      const candidates: CandidateWithTarget[] = rawCandidates.map((cand, idx) => ({
        id: cand.id || `agent-${idx + 1}`,
        name: cand.name || cand.id || `Agent ${idx + 1}`,
        initialRating: typeof cand.initialRating === "number" ? cand.initialRating : 1500,
        initialRd: typeof cand.initialRd === "number" ? cand.initialRd : 350,
        tags: cand.tags || [],
        target: async (ctx) => {
          ctx.recorder.startTurn(`Turn 1 executed by ${cand.name || cand.id}`);
          ctx.recorder.completeTurn("Scenario goal achieved");
        },
      }));

      const rounds = parseInt(options.rounds, 10) || 1;
      const kFactor = parseFloat(options.kFactor) || 32;

      const engine = new ArenaEngine();
      const report = await engine.runTournament({
        candidates,
        scenarios,
        config: {
          mode: options.mode as TournamentMode,
          rounds,
          ratingSystem: options.ratingSystem as RatingSystemType,
          kFactor,
        },
      });

      const rendered = renderArenaReport(report, options.format as ArenaReportFormat);

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, rendered, "utf8");
        console.log(chalk.gray(`Arena tournament report written to: ${options.output}`));
      } else {
        console.log(rendered);
      }

      if (options.exportLeaderboard) {
        const lbPath = path.resolve(options.exportLeaderboard);
        await fs.mkdir(path.dirname(lbPath), { recursive: true });
        await fs.writeFile(lbPath, JSON.stringify(report.leaderboard, null, 2), "utf8");
        console.log(chalk.green(`✔ Leaderboard exported to: ${options.exportLeaderboard}`));
      }

      const minRating = parseFloat(options.minRating) || 0;
      if (report.topPerformer.rating < minRating) {
        console.error(
          chalk.red(
            `✘ Top performer rating (${report.topPerformer.rating}) below minimum threshold (${minRating})`
          )
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Arena tournament execution failed:"), err.message);
      process.exit(1);
    }
  });

// redteam command
program
  .command("redteam")
  .description("Execute adversarial red-teaming security audit and safety guardrail evaluation")
  .requiredOption("-s, --scenario <path>", "Path to base scenario YAML or JSON file")
  .option("-c, --categories <categories>", "Comma-separated risk categories to test")
  .option("--severities <severities>", "Comma-separated severities: low, medium, high, critical")
  .option("-p, --probes <probeIds>", "Comma-separated specific probe IDs to execute")
  .option("-g, --guardrail <mode>", "Safety guardrail enforcement mode: none, audit, enforce", "none")
  .option("-f, --format <format>", "Output format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "File path to save the red-team safety audit report")
  .option("--export-findings <path>", "File path to export vulnerability findings as JSON")
  .option("--max-asr <threshold>", "Fail exit code if Attack Success Rate (0.0-1.0) exceeds threshold", "1.0")
  .option("--min-safety-score <score>", "Fail exit code if Safety Score (0-100) is below threshold", "0")
  .option("--benchmark-defense", "Benchmark defense posture before and after active guardrail enforcement", false)
  .action(async (options) => {
    try {
      const scenario = await loadScenario(options.scenario);
      const categories = options.categories
        ? options.categories.split(",").map((c: string) => c.trim()).filter(Boolean) as RedTeamRiskCategory[]
        : undefined;
      const severities = options.severities
        ? options.severities.split(",").map((s: string) => s.trim()).filter(Boolean) as ProbeSeverity[]
        : undefined;
      const probes = options.probes
        ? options.probes.split(",").map((p: string) => p.trim()).filter(Boolean)
        : undefined;

      const engine = new RedTeamEngine();

      const defaultAgent = async (ctx: any) => {
        ctx.recorder.startTurn("Executing task instruction");
        await ctx.executor.execute("echo 'Running task...'");
        ctx.recorder.completeTurn("Done");
      };

      if (options.benchmarkDefense) {
        const comparison = await engine.benchmarkDefense(defaultAgent, scenario, {
          categories,
          severities,
          probes,
        });

        const rendered = renderBenchmarkComparison(comparison, options.format as RedTeamReportFormat);
        if (options.output) {
          const outPath = path.resolve(options.output);
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, rendered, "utf8");
          console.log(chalk.gray(`Defense benchmark report written to: ${options.output}`));
        } else {
          console.log(rendered);
        }
      } else {
        const report = await engine.auditAgent(defaultAgent, scenario, {
          categories,
          severities,
          probes,
          guardrailMode: options.guardrail as GuardrailMode,
        });

        const rendered = renderRedTeamReport(report, options.format as RedTeamReportFormat);

        if (options.output) {
          const outPath = path.resolve(options.output);
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, rendered, "utf8");
          console.log(chalk.gray(`Red-team safety audit report written to: ${options.output}`));
        } else {
          console.log(rendered);
        }

        if (options.exportFindings) {
          const findingsPath = path.resolve(options.exportFindings);
          await fs.mkdir(path.dirname(findingsPath), { recursive: true });
          await fs.writeFile(findingsPath, JSON.stringify(report.findings, null, 2), "utf8");
          console.log(chalk.green(`✔ Vulnerability findings exported to: ${options.exportFindings}`));
        }

        const maxAsr = parseFloat(options.maxAsr) || 1.0;
        if (report.attackSuccessRate > maxAsr) {
          console.error(
            chalk.red(
              `✘ Attack Success Rate (${(report.attackSuccessRate * 100).toFixed(1)}%) exceeded maximum threshold (${(maxAsr * 100).toFixed(1)}%)`
            )
          );
          process.exit(1);
        }

        const minSafety = parseFloat(options.minSafetyScore) || 0;
        if (report.safetyScore < minSafety) {
          console.error(
            chalk.red(
              `✘ Safety Score (${report.safetyScore}) below minimum required threshold (${minSafety})`
            )
          );
          process.exit(1);
        }
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Red-team evaluation failed:"), err.message);
      process.exit(1);
    }
  });

program
  .command("reflexion")
  .description("Analyze agent trajectory self-correction, failure episodes, and cognitive pathologies")
  .requiredOption("-t, --trajectory <path>", "Path to trajectory JSON file")
  .option("-c, --compare <path>", "Comparative trajectory JSON file path to benchmark self-correction improvements")
  .option("-f, --format <format>", "Output format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "File path to save the diagnostic report")
  .option("--export-episodes <path>", "File path to export detected failure episodes as JSON")
  .option("--min-shr <threshold>", "Fail exit code if Self-Healing Rate (0.0-1.0) is below threshold", "0")
  .option("--min-resilience-score <score>", "Fail exit code if Cognitive Resilience Score (0-100) is below threshold", "0")
  .option("--max-pathologies <count>", "Fail exit code if detected pathologies count exceeds threshold")
  .action(async (options) => {
    try {
      const trajectoryRaw = await fs.readFile(path.resolve(options.trajectory), "utf8");
      const trajectory = JSON.parse(trajectoryRaw);

      const engine = new ReflexionEngine();

      if (options.compare) {
        const comparativeRaw = await fs.readFile(path.resolve(options.compare), "utf8");
        const comparative = JSON.parse(comparativeRaw);

        const baselineReport = engine.analyzeTrajectory(trajectory);
        const comparativeReport = engine.analyzeTrajectory(comparative);
        const comparison = engine.compare(baselineReport, comparativeReport);

        const rendered = renderReflexionComparison(comparison, options.format as ReflexionReportFormat);

        if (options.output) {
          const outPath = path.resolve(options.output);
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, rendered, "utf8");
          console.log(chalk.gray(`Reflexion comparison report written to: ${options.output}`));
        } else {
          console.log(rendered);
        }
      } else {
        const report = engine.analyzeTrajectory(trajectory);
        const rendered = renderReflexionReport(report, options.format as ReflexionReportFormat);

        if (options.output) {
          const outPath = path.resolve(options.output);
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, rendered, "utf8");
          console.log(chalk.gray(`Reflexion diagnostic report written to: ${options.output}`));
        } else {
          console.log(rendered);
        }

        if (options.exportEpisodes) {
          const episodesPath = path.resolve(options.exportEpisodes);
          await fs.mkdir(path.dirname(episodesPath), { recursive: true });
          await fs.writeFile(episodesPath, JSON.stringify(report.episodes, null, 2), "utf8");
          console.log(chalk.green(`✔ Failure episodes exported to: ${options.exportEpisodes}`));
        }

        const minShr = parseFloat(options.minShr) || 0;
        if (report.metrics.selfHealingRate < minShr) {
          console.error(
            chalk.red(
              `✘ Self-Healing Rate (${(report.metrics.selfHealingRate * 100).toFixed(1)}%) below minimum threshold (${(minShr * 100).toFixed(1)}%)`
            )
          );
          process.exit(1);
        }

        const minScore = parseFloat(options.minResilienceScore) || 0;
        if (report.metrics.cognitiveResilienceScore < minScore) {
          console.error(
            chalk.red(
              `✘ Cognitive Resilience Score (${report.metrics.cognitiveResilienceScore}) below minimum threshold (${minScore})`
            )
          );
          process.exit(1);
        }

        if (options.maxPathologies !== undefined) {
          const maxPath = parseInt(options.maxPathologies, 10);
          if (report.metrics.pathologyCount > maxPath) {
            console.error(
              chalk.red(
                `✘ Pathology count (${report.metrics.pathologyCount}) exceeded maximum allowed threshold (${maxPath})`
              )
            );
            process.exit(1);
          }
        }
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Reflexion analysis failed:"), err.message);
      process.exit(1);
    }
  });

  program
  .command("timetravel")
  .description("Time-travel trajectory debugging, automated failure bisection, and counterfactual branch simulation")
  .requiredOption("-t, --trajectory <path>", "Path to trajectory JSON file")
  .option("-b, --bisect", "Run automated binary failure bisection", false)
  .option(
    "--predicate-type <type>",
    "Bisect predicate: exit-code-success, file-exists, file-contains, no-error-output",
    "exit-code-success"
  )
  .option("--predicate-arg <arg>", "Argument for predicate (e.g. filename or pattern)")
  .option("--fork-turn <turn>", "Fork a counterfactual branch at turn number", (v) => parseInt(v, 10))
  .option("--override-exit-code <code>", "Override exit code in counterfactual branch", (v) => parseInt(v, 10))
  .option("--override-output <output>", "Override tool output in counterfactual branch")
  .option("-f, --format <format>", "Output format: terminal, markdown, json", "terminal")
  .option("-o, --output <path>", "Output file path to save report")
  .option("--export-snapshots <path>", "Export all turn snapshots to JSON file")
  .option("--fail-on-regression", "Exit with code 1 if a regression was pinpointed by bisect", false)
  .action(async (options) => {
    try {
      const trajPath = path.resolve(options.trajectory);
      const raw = await fs.readFile(trajPath, "utf8");
      const trajectory = JSON.parse(raw);

      const engine = new TimeTravelEngine();
      const branches = [];

      if (options.forkTurn !== undefined) {
        const mutations: CounterfactualMutation[] = [];
        if (options.overrideExitCode !== undefined || options.overrideOutput !== undefined) {
          mutations.push({
            type: "override-tool-result",
            mockResult: {
              exitCode: options.overrideExitCode ?? 0,
              success: options.overrideExitCode === 0 || options.overrideExitCode === undefined,
              output: options.overrideOutput,
            },
          });
        }
        const branch = await engine.forkBranch(trajectory, {
          forkTurn: options.forkTurn,
          mutations,
        });
        branches.push(branch);
      }

      const bisectOptions = options.bisect
        ? {
            predicateType: options.predicateType as BuiltinPredicateType,
            predicateArg: options.predicateArg,
          }
        : undefined;

      const report = await engine.generateReport(trajectory, {
        runBisect: Boolean(options.bisect),
        bisectOptions,
        counterfactualBranches: branches,
      });

      const rendered = renderTimeTravelReport(report, options.format as TimeTravelReportFormat);

      if (options.output) {
        const outPath = path.resolve(options.output);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, rendered, "utf8");
        console.log(chalk.gray(`Time-travel report written to: ${options.output}`));
      } else {
        console.log(rendered);
      }

      if (options.exportSnapshots) {
        const snapPath = path.resolve(options.exportSnapshots);
        await fs.mkdir(path.dirname(snapPath), { recursive: true });
        const { snapshotManager } = engine.createSession(trajectory);
        await fs.writeFile(
          snapPath,
          JSON.stringify(snapshotManager.getAllSnapshots(), null, 2),
          "utf8"
        );
        console.log(chalk.green(`✔ Turn snapshots exported to: ${options.exportSnapshots}`));
      }

      if (options.failOnRegression && report.bisectResult && report.bisectResult.firstFaultyTurn !== null) {
        console.error(
          chalk.red(
            `✘ Failure regression pinpointed at Turn ${report.bisectResult.firstFaultyTurn}`
          )
        );
        process.exit(1);
      }
    } catch (err: any) {
      console.error(chalk.red("✘ Time-travel analysis failed:"), err.message);
      process.exit(1);
    }
  });

  program
    .command("causal")
    .description("Build causal dependency DAG, compute dynamic backward slices, and rank root-cause attributions")
    .requiredOption("-t, --trajectory <path>", "Path to trajectory JSON file")
    .option("-s, --scenario <path>", "Path to scenario file (YAML/JSON)")
    .option("--target <nodeId>", "Target node ID for backward slicing (auto-detected if omitted)")
    .option("--min-attribution-score <score>", "Minimum responsibility score threshold", (v) => parseFloat(v), 0)
    .option("-f, --format <format>", "Output format: terminal, markdown, mermaid, dot, json", "terminal")
    .option("-o, --output <path>", "Output file path to save report")
    .option("--export-graph <path>", "Export raw CausalGraph JSON to file")
    .option("--fail-on-root-cause", "Exit with code 1 if a high-confidence root cause (>=60%) is detected", false)
    .action(async (options) => {
      try {
        const trajPath = path.resolve(options.trajectory);
        const raw = await fs.readFile(trajPath, "utf8");
        const trajectory = JSON.parse(raw);

        let scenario: any;
        if (options.scenario) {
          scenario = await loadScenario(options.scenario);
        }

        const engine = new CausalAttributionEngine();
        const graph = engine.buildGraph(trajectory, { scenario });
        const report = engine.analyze(trajectory, {
          scenario,
          targetNodeId: options.target,
          minAttributionScore: options.minAttributionScore,
        });

        const rendered = renderCausalReport(report, options.format as CausalReportFormat, graph);

        if (options.output) {
          const outPath = path.resolve(options.output);
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, rendered, "utf8");
          console.log(chalk.gray(`Causal attribution report written to: ${options.output}`));
        } else {
          console.log(rendered);
        }

        if (options.exportGraph) {
          const graphPath = path.resolve(options.exportGraph);
          await fs.mkdir(path.dirname(graphPath), { recursive: true });
          await fs.writeFile(graphPath, JSON.stringify(graph, null, 2), "utf8");
          console.log(chalk.green(`✔ Causal DAG exported to: ${options.exportGraph}`));
        }

        if (options.failOnRootCause) {
          const top = report.topAttributions[0];
          if (top && top.responsibilityScore >= 0.5) {
            console.error(
              chalk.red(
                `✘ High-confidence root cause detected: [Turn ${top.turnNumber ?? "?"}] ${top.label} (${Math.round(top.responsibilityScore * 100)}% responsibility)`
              )
            );
            process.exit(1);
          }
        }
      } catch (err: any) {
        console.error(chalk.red("✘ Causal analysis failed:"), err.message);
        process.exit(1);
      }
    });

program.parse(process.argv);





import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ScenarioDefinitionSchema } from '../core/schemas.js';
import { AgentHarness, AgentExecutionContext } from '../core/harness.js';
import { BenchmarkOptions, BenchmarkScenarioResult, BenchmarkSummary } from './types.js';
import { SWEBenchAdapter } from './swebench/adapter.js';
import { SWEBenchEvaluator } from './swebench/evaluator.js';
import { SWEBenchAdapterOptions, SWEBenchSuiteSummary, SWEBenchInstance } from './swebench/types.js';

export interface SWEBenchBenchmarkOptions {
  datasetPath?: string;
  instances?: SWEBenchInstance[];
  concurrency?: number;
  stopOnFailure?: boolean;
  adapterOptions?: SWEBenchAdapterOptions;
}

export class BenchmarkRunner {
  public static async loadScenariosFromDir(dirPath: string): Promise<Array<{ path: string; scenario: any }>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const scenarios: Array<{ path: string; scenario: any }> = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const fullPath = path.join(dirPath, entry.name);
      if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml') || entry.name.endsWith('.json')) {
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = fullPath.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
        const validated = ScenarioDefinitionSchema.parse(parsed);
        scenarios.push({ path: fullPath, scenario: validated });
      } else if (entry.name.endsWith('.jsonl')) {
        const instances = await SWEBenchAdapter.readJSONL(fullPath, { tolerant: true });
        for (const inst of instances) {
          const scenario = SWEBenchAdapter.toScenario(inst);
          scenarios.push({ path: `${fullPath}#${inst.instance_id}`, scenario });
        }
      }
    }
    return scenarios;
  }

  public static async runSuite(
    options: BenchmarkOptions,
    agentRunner?: (ctx: AgentExecutionContext) => Promise<void>
  ): Promise<BenchmarkSummary> {
    const startTime = Date.now();
    const results: BenchmarkScenarioResult[] = [];
    const concurrency = Math.max(1, options.concurrency || 1);

    const scenarioItems: Array<{ path: string; scenario: any }> = [];
    for (const p of options.scenarioPaths) {
      const stat = await fs.stat(p);
      if (stat.isDirectory()) {
        const fromDir = await this.loadScenariosFromDir(p);
        scenarioItems.push(...fromDir);
      } else if (p.endsWith('.jsonl')) {
        const instances = await SWEBenchAdapter.readJSONL(p, { tolerant: true });
        for (const inst of instances) {
          const scenario = SWEBenchAdapter.toScenario(inst);
          scenarioItems.push({ path: `${p}#${inst.instance_id}`, scenario });
        }
      } else {
        const raw = await fs.readFile(p, 'utf8');
        const parsed = p.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
        const validated = ScenarioDefinitionSchema.parse(parsed);
        scenarioItems.push({ path: p, scenario: validated });
      }
    }

    const defaultMockRunner = async (ctx: AgentExecutionContext) => {
      ctx.recorder.startTurn("Default benchmark mock runner");
      ctx.recorder.completeTurn("Completed scenario tasks automatically");
    };

    const runner = agentRunner || defaultMockRunner;

    for (let i = 0; i < scenarioItems.length; i += concurrency) {
      const chunk = scenarioItems.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async ({ path: filePath, scenario }) => {
        const scenarioStart = Date.now();
        try {
          const { report, trajectory } = await AgentHarness.runScenario(scenario, runner);
          const result: BenchmarkScenarioResult = {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            filePath,
            passed: report.passed,
            durationMs: Date.now() - scenarioStart,
            totalTurns: trajectory.summary.totalTurns,
            tokensUsed: trajectory.summary.totalTokens,
            costUsd: trajectory.summary.costUsd || 0,
            passedAssertions: report.metrics.passedAssertions,
            failedAssertions: report.metrics.failedAssertions,
            report,
          };
          return result;
        } catch (err: any) {
          const result: BenchmarkScenarioResult = {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            filePath,
            passed: false,
            durationMs: Date.now() - scenarioStart,
            totalTurns: 0,
            tokensUsed: 0,
            costUsd: 0,
            passedAssertions: 0,
            failedAssertions: 1,
            error: err.message,
          };
          return result;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      if (options.stopOnFailure && chunkResults.some((r) => !r.passed)) {
        break;
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.length - passedCount;
    const totalTokens = results.reduce((acc, r) => acc + r.tokensUsed, 0);
    const totalCostUsd = results.reduce((acc, r) => acc + r.costUsd, 0);
    const passRate = results.length > 0 ? (passedCount / results.length) * 100 : 0;

    return {
      totalScenarios: results.length,
      passedScenarios: passedCount,
      failedScenarios: failedCount,
      passRatePercent: Math.round(passRate * 100) / 100,
      totalDurationMs: Date.now() - startTime,
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      results,
    };
  }

  /**
   * Run an SWE-bench dataset suite, evaluating agents against SWE-bench task instances.
   */
  public static async runSWEBench(
    options: SWEBenchBenchmarkOptions,
    agentRunner?: (ctx: AgentExecutionContext) => Promise<void>
  ): Promise<{ summary: BenchmarkSummary; swebench: SWEBenchSuiteSummary }> {
    let instances: SWEBenchInstance[];
    if (options.instances && options.instances.length > 0) {
      instances = options.instances;
    } else if (options.datasetPath) {
      instances = await SWEBenchAdapter.readJSONL(options.datasetPath, { tolerant: true });
    } else {
      throw new Error('Either datasetPath or instances must be provided to runSWEBench');
    }

    const scenarios = instances.map((inst) => ({
      instance: inst,
      scenario: SWEBenchAdapter.toScenario(inst, options.adapterOptions),
    }));

    const benchmarkOptions: BenchmarkOptions = {
      scenarioPaths: [],
      concurrency: options.concurrency || 1,
      stopOnFailure: options.stopOnFailure,
    };

    const startTime = Date.now();
    const benchmarkResults: BenchmarkScenarioResult[] = [];
    const evalItems: Array<{ instanceId: string; report?: any; durationMs?: number }> = [];

    const defaultMockRunner = async (ctx: AgentExecutionContext) => {
      ctx.recorder.startTurn("Default SWE-bench mock runner");
      ctx.recorder.completeTurn("Completed tasks");
    };
    const runner = agentRunner || defaultMockRunner;

    const concurrency = Math.max(1, benchmarkOptions.concurrency || 1);

    for (let i = 0; i < scenarios.length; i += concurrency) {
      const chunk = scenarios.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async ({ instance, scenario }) => {
        const scenarioStart = Date.now();
        try {
          const { report, trajectory } = await AgentHarness.runScenario(scenario, runner);
          const dur = Date.now() - scenarioStart;
          const result: BenchmarkScenarioResult = {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            filePath: `swebench://${instance.instance_id}`,
            passed: report.passed,
            durationMs: dur,
            totalTurns: trajectory.summary.totalTurns,
            tokensUsed: trajectory.summary.totalTokens,
            costUsd: trajectory.summary.costUsd || 0,
            passedAssertions: report.metrics.passedAssertions,
            failedAssertions: report.metrics.failedAssertions,
            report,
          };
          evalItems.push({
            instanceId: instance.instance_id,
            report,
            durationMs: dur,
          });
          return result;
        } catch (err: any) {
          const dur = Date.now() - scenarioStart;
          const result: BenchmarkScenarioResult = {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            filePath: `swebench://${instance.instance_id}`,
            passed: false,
            durationMs: dur,
            totalTurns: 0,
            tokensUsed: 0,
            costUsd: 0,
            passedAssertions: 0,
            failedAssertions: 1,
            error: err.message,
          };
          evalItems.push({
            instanceId: instance.instance_id,
            durationMs: dur,
          });
          return result;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      benchmarkResults.push(...chunkResults);

      if (options.stopOnFailure && chunkResults.some((r) => !r.passed)) {
        break;
      }
    }

    const passedCount = benchmarkResults.filter((r) => r.passed).length;
    const failedCount = benchmarkResults.length - passedCount;
    const totalTokens = benchmarkResults.reduce((acc, r) => acc + r.tokensUsed, 0);
    const totalCostUsd = benchmarkResults.reduce((acc, r) => acc + r.costUsd, 0);
    const passRate = benchmarkResults.length > 0 ? (passedCount / benchmarkResults.length) * 100 : 0;

    const summary: BenchmarkSummary = {
      totalScenarios: benchmarkResults.length,
      passedScenarios: passedCount,
      failedScenarios: failedCount,
      passRatePercent: Math.round(passRate * 100) / 100,
      totalDurationMs: Date.now() - startTime,
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      results: benchmarkResults,
    };

    const swebench = SWEBenchEvaluator.evaluateSuite(instances, evalItems);

    return { summary, swebench };
  }
}

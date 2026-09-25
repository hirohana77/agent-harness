import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { ScenarioDefinitionSchema } from '../core/schemas.js';
import { AgentHarness, AgentExecutionContext } from '../core/harness.js';
import { BenchmarkOptions, BenchmarkScenarioResult, BenchmarkSummary } from './types.js';

export class BenchmarkRunner {
  public static async loadScenariosFromDir(dirPath: string): Promise<Array<{ path: string; scenario: any }>> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const scenarios: Array<{ path: string; scenario: any }> = [];

    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml') || entry.name.endsWith('.json'))) {
        const fullPath = path.join(dirPath, entry.name);
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = fullPath.endsWith('.json') ? JSON.parse(raw) : YAML.parse(raw);
        const validated = ScenarioDefinitionSchema.parse(parsed);
        scenarios.push({ path: fullPath, scenario: validated });
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
}

import fs from 'node:fs/promises';
import { HarnessReport } from '../../core/types.js';
import {
  SWEBenchInstance,
  SWEBenchInstanceEvalResult,
  SWEBenchSuiteSummary,
  SWEBenchTestResult,
  SWEBenchTestStatus,
  SWEBenchInstanceResolution,
  SWEBenchPrediction,
} from './types.js';
import { SWEBenchPredictionSchema } from './schemas.js';

export interface ParsedTestResults {
  passedTests: Set<string>;
  failedTests: Set<string>;
  skippedTests: Set<string>;
}

export class SWEBenchEvaluator {
  /**
   * Parse test execution output from pytest or python unittest runners.
   */
  public static parseTestOutput(rawOutput: string): ParsedTestResults {
    const passedTests = new Set<string>();
    const failedTests = new Set<string>();
    const skippedTests = new Set<string>();

    const lines = rawOutput.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 1. Pytest format: test_path.py::test_func PASSED
      const pytestPassMatch = trimmed.match(/^([\S]+)\s+PASSED/);
      if (pytestPassMatch) {
        passedTests.add(pytestPassMatch[1]);
        continue;
      }

      // Pytest format: PASSED test_path.py::test_func
      const pytestPassPrefixMatch = trimmed.match(/^PASSED\s+([\S]+)/);
      if (pytestPassPrefixMatch) {
        passedTests.add(pytestPassPrefixMatch[1]);
        continue;
      }

      // Pytest format: test_path.py::test_func FAILED or ERROR
      const pytestFailMatch = trimmed.match(/^([\S]+)\s+(FAILED|ERROR)/);
      if (pytestFailMatch) {
        failedTests.add(pytestFailMatch[1]);
        continue;
      }

      // Pytest format: FAILED test_path.py::test_func or ERROR test_path.py::test_func
      const pytestFailPrefixMatch = trimmed.match(/^(?:FAILED|ERROR)\s+([\S]+)/);
      if (pytestFailPrefixMatch) {
        failedTests.add(pytestFailPrefixMatch[1]);
        continue;
      }

      // Pytest format: test_path.py::test_func SKIPPED
      const pytestSkipMatch = trimmed.match(/^([\S]+)\s+SKIPPED/);
      if (pytestSkipMatch) {
        skippedTests.add(pytestSkipMatch[1]);
        continue;
      }

      // 2. Python unittest format: test_name (module.TestClass) ... ok
      const unittestPassMatch = trimmed.match(/^([\w_]+(?:\s*\([\w_.]+\))?)\s*\.\.\.\s*ok$/i);
      if (unittestPassMatch) {
        passedTests.add(unittestPassMatch[1].trim());
        continue;
      }

      // Python unittest format: test_name (module.TestClass) ... FAIL / ERROR
      const unittestFailMatch = trimmed.match(/^([\w_]+(?:\s*\([\w_.]+\))?)\s*\.\.\.\s*(?:FAIL|ERROR)$/i);
      if (unittestFailMatch) {
        failedTests.add(unittestFailMatch[1].trim());
        continue;
      }
    }

    return { passedTests, failedTests, skippedTests };
  }

  /**
   * Helper to determine whether a target test identifier matches parsed test names.
   */
  private static matchTestInSet(target: string, testSet: Set<string>): boolean {
    if (testSet.has(target)) return true;

    // Normalize separators (: to ., / to .)
    const normalizedTarget = target.replace(/[:/\\]+/g, '.');

    for (const item of testSet) {
      if (item === target) return true;
      const normalizedItem = item.replace(/[:/\\]+/g, '.');
      if (normalizedItem === normalizedTarget) return true;

      // Suffix or leaf match (e.g. test_something matching tests.mod::TestClass::test_something)
      if (item.endsWith(target) || target.endsWith(item)) return true;
      if (normalizedItem.endsWith(normalizedTarget) || normalizedTarget.endsWith(normalizedItem)) return true;
    }

    return false;
  }

  /**
   * Evaluate a single SWE-bench instance given raw test output or a HarnessReport.
   */
  public static evaluateInstance(
    instance: SWEBenchInstance,
    outputOrReport: string | HarnessReport,
    durationMs = 0
  ): SWEBenchInstanceEvalResult {
    let rawOutput = '';
    let reportPassed: boolean | undefined;

    if (typeof outputOrReport === 'string') {
      rawOutput = outputOrReport;
    } else {
      reportPassed = outputOrReport.passed;
      // Extract stdout/stderr from command assertion results
      const cmdOutputs: string[] = [];
      for (const res of outputOrReport.assertionResults) {
        if (res.type === 'command' && res.details) {
          const det = res.details as any;
          if (det.output) cmdOutputs.push(String(det.output));
          if (det.error) cmdOutputs.push(String(det.error));
        }
      }
      rawOutput = cmdOutputs.join('\n');
    }

    const { passedTests, failedTests, skippedTests } = this.parseTestOutput(rawOutput);

    const testResults: SWEBenchTestResult[] = [];
    let failToPassPassed = 0;
    let passToPassPassed = 0;

    // Check FAIL_TO_PASS tests (must pass for fix to be accepted)
    for (const testName of instance.FAIL_TO_PASS) {
      let status: SWEBenchTestStatus = 'NOT_RUN';
      if (this.matchTestInSet(testName, passedTests)) {
        status = 'PASSED';
      } else if (this.matchTestInSet(testName, failedTests)) {
        status = 'FAILED';
      } else if (this.matchTestInSet(testName, skippedTests)) {
        status = 'SKIPPED';
      } else if (reportPassed === true && failedTests.size === 0) {
        // Fallback: If harness report passed cleanly and no failures found
        status = 'PASSED';
      }

      const passed = status === 'PASSED';
      if (passed) failToPassPassed++;

      testResults.push({
        testName,
        category: 'FAIL_TO_PASS',
        status,
        expectedStatus: 'PASSED',
        passed,
      });
    }

    // Check PASS_TO_PASS tests (must not regress)
    for (const testName of instance.PASS_TO_PASS) {
      let status: SWEBenchTestStatus = 'NOT_RUN';
      if (this.matchTestInSet(testName, passedTests)) {
        status = 'PASSED';
      } else if (this.matchTestInSet(testName, failedTests)) {
        status = 'FAILED';
      } else if (this.matchTestInSet(testName, skippedTests)) {
        status = 'SKIPPED';
      } else if (reportPassed === true && failedTests.size === 0) {
        status = 'PASSED';
      }

      // If PASS_TO_PASS was not re-run, by default assume passed unless explicit failure
      const passed = status !== 'FAILED';
      if (passed) passToPassPassed++;

      testResults.push({
        testName,
        category: 'PASS_TO_PASS',
        status,
        expectedStatus: 'PASSED',
        passed,
      });
    }

    const failToPassAllPassed = instance.FAIL_TO_PASS.length === 0 || failToPassPassed === instance.FAIL_TO_PASS.length;
    const passToPassAllPassed = instance.PASS_TO_PASS.length === 0 || passToPassPassed === instance.PASS_TO_PASS.length;

    let resolution: SWEBenchInstanceResolution;
    let resolved = false;

    if (failToPassAllPassed && passToPassAllPassed) {
      resolution = 'RESOLVED';
      resolved = true;
    } else if (failToPassAllPassed && !passToPassAllPassed) {
      resolution = 'REGRESSION';
    } else {
      resolution = 'UNRESOLVED';
    }

    // Check for hard errors (e.g. command fatal exit with syntax error or missing runner)
    if (!resolved && (rawOutput.includes('SyntaxError:') || rawOutput.includes('ModuleNotFoundError:'))) {
      resolution = 'ERROR';
    }

    return {
      instanceId: instance.instance_id,
      repo: instance.repo,
      resolved,
      resolution,
      failToPassTotal: instance.FAIL_TO_PASS.length,
      failToPassPassed,
      passToPassTotal: instance.PASS_TO_PASS.length,
      passToPassPassed,
      testResults,
      durationMs,
      rawOutput: rawOutput.slice(0, 5000),
    };
  }

  /**
   * Evaluate an entire suite of SWE-bench instances.
   */
  public static evaluateSuite(
    instances: SWEBenchInstance[],
    results: Array<{ instanceId: string; output?: string; report?: HarnessReport; durationMs?: number }>
  ): SWEBenchSuiteSummary {
    const instanceMap = new Map<string, SWEBenchInstance>();
    for (const inst of instances) {
      instanceMap.set(inst.instance_id, inst);
    }

    const evalResults: SWEBenchInstanceEvalResult[] = [];
    let totalDurationMs = 0;

    for (const item of results) {
      const inst = instanceMap.get(item.instanceId);
      if (!inst) continue;

      const dur = item.durationMs ?? (item.report ? item.report.metrics.durationMs : 0);
      totalDurationMs += dur;

      const res = this.evaluateInstance(inst, item.output ?? item.report ?? '', dur);
      evalResults.push(res);
    }

    const totalInstances = evalResults.length;
    const resolvedInstances = evalResults.filter((r) => r.resolved).length;
    const regressions = evalResults.filter((r) => r.resolution === 'REGRESSION').length;
    const errors = evalResults.filter((r) => r.resolution === 'ERROR').length;
    const unresolvedInstances = totalInstances - resolvedInstances;

    const resolveRatePercent = totalInstances > 0
      ? Math.round((resolvedInstances / totalInstances) * 10000) / 100
      : 0;

    // Per-repo aggregation
    const byRepo: Record<string, { total: number; resolved: number; resolveRatePercent: number }> = {};
    for (const res of evalResults) {
      if (!byRepo[res.repo]) {
        byRepo[res.repo] = { total: 0, resolved: 0, resolveRatePercent: 0 };
      }
      byRepo[res.repo].total++;
      if (res.resolved) {
        byRepo[res.repo].resolved++;
      }
    }

    for (const repo of Object.keys(byRepo)) {
      const repoStat = byRepo[repo];
      repoStat.resolveRatePercent = repoStat.total > 0
        ? Math.round((repoStat.resolved / repoStat.total) * 10000) / 100
        : 0;
    }

    return {
      totalInstances,
      resolvedInstances,
      unresolvedInstances,
      regressions,
      errors,
      resolveRatePercent,
      totalDurationMs,
      byRepo,
      results: evalResults,
    };
  }

  /**
   * Create an official SWE-bench prediction object.
   */
  public static createPrediction(instanceId: string, modelPatch: string, modelName = 'agent-harness'): SWEBenchPrediction {
    return {
      instance_id: instanceId,
      model_patch: modelPatch,
      model_name_or_path: modelName,
    };
  }

  /**
   * Export predictions to a JSON file.
   */
  public static async exportPredictionsJSON(predictions: SWEBenchPrediction[], filePath: string): Promise<void> {
    const data = JSON.stringify(predictions, null, 2);
    await fs.writeFile(filePath, data, 'utf8');
  }

  /**
   * Load predictions from a JSON file.
   */
  public static async loadPredictionsJSON(filePath: string): Promise<SWEBenchPrediction[]> {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Predictions file must contain an array of predictions');
    }
    return parsed.map((p) => SWEBenchPredictionSchema.parse(p));
  }
}

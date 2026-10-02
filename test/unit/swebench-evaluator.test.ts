import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SWEBenchEvaluator } from '../../src/benchmark/swebench/evaluator.js';
import { SWEBenchInstance } from '../../src/benchmark/swebench/types.js';
import { HarnessReport } from '../../src/core/types.js';

describe('SWEBenchEvaluator', () => {
  const instanceA: SWEBenchInstance = {
    instance_id: 'repo__test-1',
    repo: 'sample/repoA',
    base_commit: 'abc1234',
    problem_statement: 'Bug description',
    FAIL_TO_PASS: ['test_fix_behavior'],
    PASS_TO_PASS: ['test_baseline_behavior'],
  };

  const instanceB: SWEBenchInstance = {
    instance_id: 'repo__test-2',
    repo: 'sample/repoB',
    base_commit: 'def5678',
    problem_statement: 'Another bug',
    FAIL_TO_PASS: ['test_bug_fix'],
    PASS_TO_PASS: ['test_keep_working'],
  };

  it('parses pytest output accurately', () => {
    const rawPytestOutput = `
tests/test_mod.py::test_fix_behavior PASSED
tests/test_mod.py::test_baseline_behavior PASSED
tests/test_mod.py::test_other_skip SKIPPED
tests/test_mod.py::test_bug_fail FAILED
    `;
    const parsed = SWEBenchEvaluator.parseTestOutput(rawPytestOutput);
    expect(parsed.passedTests.has('tests/test_mod.py::test_fix_behavior')).toBe(true);
    expect(parsed.passedTests.has('tests/test_mod.py::test_baseline_behavior')).toBe(true);
    expect(parsed.failedTests.has('tests/test_mod.py::test_bug_fail')).toBe(true);
    expect(parsed.skippedTests.has('tests/test_mod.py::test_other_skip')).toBe(true);
  });

  it('parses unittest output accurately', () => {
    const rawUnittestOutput = `
test_fix_behavior (tests.test_unit.MyTest) ... ok
test_baseline_behavior (tests.test_unit.MyTest) ... ok
test_failed (tests.test_unit.MyTest) ... FAIL
test_error (tests.test_unit.MyTest) ... ERROR
    `;
    const parsed = SWEBenchEvaluator.parseTestOutput(rawUnittestOutput);
    expect(parsed.passedTests.size).toBe(2);
    expect(parsed.failedTests.size).toBe(2);
  });

  it('evaluates instance as RESOLVED when all FAIL_TO_PASS pass and no regressions occur', () => {
    const output = `
tests/test_suite.py::test_fix_behavior PASSED
tests/test_suite.py::test_baseline_behavior PASSED
    `;
    const res = SWEBenchEvaluator.evaluateInstance(instanceA, output);
    expect(res.resolved).toBe(true);
    expect(res.resolution).toBe('RESOLVED');
    expect(res.failToPassPassed).toBe(1);
    expect(res.passToPassPassed).toBe(1);
  });

  it('evaluates instance as UNRESOLVED when FAIL_TO_PASS does not pass', () => {
    const output = `
tests/test_suite.py::test_fix_behavior FAILED
tests/test_suite.py::test_baseline_behavior PASSED
    `;
    const res = SWEBenchEvaluator.evaluateInstance(instanceA, output);
    expect(res.resolved).toBe(false);
    expect(res.resolution).toBe('UNRESOLVED');
  });

  it('evaluates instance as REGRESSION when FAIL_TO_PASS passes but PASS_TO_PASS fails', () => {
    const output = `
tests/test_suite.py::test_fix_behavior PASSED
tests/test_suite.py::test_baseline_behavior FAILED
    `;
    const res = SWEBenchEvaluator.evaluateInstance(instanceA, output);
    expect(res.resolved).toBe(false);
    expect(res.resolution).toBe('REGRESSION');
  });

  it('evaluates instance from HarnessReport assertion details', () => {
    const mockReport: HarnessReport = {
      scenarioId: 'repo__test-1',
      scenarioName: 'SWE-bench: repo__test-1',
      timestamp: new Date().toISOString(),
      passed: true,
      assertionResults: [
        {
          type: 'command',
          target: 'Run SWE-bench Evaluation Suite',
          passed: true,
          message: 'Exit 0',
          details: {
            output: 'test_fix_behavior PASSED\ntest_baseline_behavior PASSED',
          },
        },
      ],
      trajectorySummary: {
        totalTurns: 2,
        totalToolCalls: 2,
        totalTokens: 500,
        costUsd: 0.001,
        completed: true,
      },
      metrics: {
        durationMs: 1250,
        totalTurns: 2,
        totalAssertions: 1,
        passedAssertions: 1,
        failedAssertions: 0,
        totalTokens: 500,
        costUsd: 0.001,
      },
    };

    const res = SWEBenchEvaluator.evaluateInstance(instanceA, mockReport);
    expect(res.resolved).toBe(true);
    expect(res.resolution).toBe('RESOLVED');
  });

  it('evaluates an entire test suite and aggregates per-repo metrics', () => {
    const results = [
      {
        instanceId: 'repo__test-1',
        output: 'test_fix_behavior PASSED\ntest_baseline_behavior PASSED',
        durationMs: 1000,
      },
      {
        instanceId: 'repo__test-2',
        output: 'test_bug_fix FAILED\ntest_keep_working PASSED',
        durationMs: 1500,
      },
    ];

    const suite = SWEBenchEvaluator.evaluateSuite([instanceA, instanceB], results);
    expect(suite.totalInstances).toBe(2);
    expect(suite.resolvedInstances).toBe(1);
    expect(suite.unresolvedInstances).toBe(1);
    expect(suite.resolveRatePercent).toBe(50);
    expect(suite.totalDurationMs).toBe(2500);

    expect(suite.byRepo['sample/repoA'].resolveRatePercent).toBe(100);
    expect(suite.byRepo['sample/repoB'].resolveRatePercent).toBe(0);
  });

  it('handles creation and serialization of official prediction format', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-pred-'));
    try {
      const pred = SWEBenchEvaluator.createPrediction('repo__test-1', 'diff --git a/...', 'agent-harness-v1');
      expect(pred.instance_id).toBe('repo__test-1');
      expect(pred.model_name_or_path).toBe('agent-harness-v1');

      const predPath = path.join(tmpDir, 'preds.json');
      await SWEBenchEvaluator.exportPredictionsJSON([pred], predPath);

      const loaded = await SWEBenchEvaluator.loadPredictionsJSON(predPath);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].instance_id).toBe('repo__test-1');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

  it('strips ANSI color escape codes before parsing test outputs', () => {
    const ansiColored = '\u001b[32mtests/test_foo.py::test_fix_behavior PASSED\u001b[0m\n\u001b[31mtests/test_bar.py::test_bug FAILED\u001b[0m';
    const parsed = SWEBenchEvaluator.parseTestOutput(ansiColored);
    expect(parsed.passedTests.has('tests/test_foo.py::test_fix_behavior')).toBe(true);
    expect(parsed.failedTests.has('tests/test_bar.py::test_bug')).toBe(true);
  });

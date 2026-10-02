import { describe, it, expect } from 'vitest';
import { BenchmarkRunner } from '../../src/benchmark/runner.js';
import { SWEBenchInstance } from '../../src/benchmark/swebench/types.js';

describe('BenchmarkRunner with SWE-bench', () => {
  const instance: SWEBenchInstance = {
    instance_id: 'test__repo-bench',
    repo: 'sample/repo',
    base_commit: '1234567',
    problem_statement: 'Sample issue for benchmark',
    FAIL_TO_PASS: ['test_fix'],
    PASS_TO_PASS: ['test_stable'],
  };

  it('runs SWE-bench benchmark suite with instances and generates both summaries', async () => {
    const { summary, swebench } = await BenchmarkRunner.runSWEBench({
      instances: [instance],
      concurrency: 1,
      adapterOptions: {
        sandboxBackend: 'local',
        testRunnerCommand: 'echo "test_fix PASSED\ntest_stable PASSED"',
      },
    }, async (ctx) => {
      ctx.recorder.startTurn('Agent working on SWE-bench');
      const res = await ctx.executor.execute('echo "test_fix PASSED\ntest_stable PASSED"');
      ctx.recorder.recordToolCall('bash', { cmd: 'test' }, { success: true, output: res.output }, 10);
      ctx.recorder.completeTurn('Done');
    });

    expect(summary.totalScenarios).toBe(1);
    console.log(JSON.stringify(summary, null, 2)); expect(summary.passedScenarios).toBe(1);
    expect(swebench.totalInstances).toBe(1);
    expect(swebench.resolvedInstances).toBe(1);
    expect(swebench.resolveRatePercent).toBe(100);
  });
});

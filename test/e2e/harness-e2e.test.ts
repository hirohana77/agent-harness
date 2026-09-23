import { describe, it, expect } from 'vitest';
import { AgentHarness } from '../../src/core/harness.js';
import { ScenarioDefinition } from '../../src/core/types.js';

describe('AgentHarness End-to-End Workflow', () => {
  it('executes a scenario with an autonomous agent fixing a bug and passes all assertions', async () => {
    const scenario: ScenarioDefinition = {
      id: 'e2e-calculator-fix',
      name: 'Calculator Bug Fix E2E',
      description: 'Agent fixes add function and writes documentation',
      version: '1.0.0',
      workspace: {
        initialFiles: {
          'src/calc.js': 'function add(a, b) { throw new Error("Not implemented"); }\nmodule.exports = { add };\n',
        },
      },
      budgets: {
        maxTurns: 10,
        timeoutMs: 30000,
        maxTokens: 50000,
      },
      task: {
        instruction: 'Fix the add function in src/calc.js to return a + b, and create README.md',
      },
      assertions: {
        files: [
          {
            path: 'src/calc.js',
            shouldExist: true,
            contains: 'return a + b',
            notContains: 'Not implemented',
          },
          {
            path: 'README.md',
            shouldExist: true,
            contains: '# Calculator',
          },
        ],
        commands: [
          {
            command: 'node -e "const { add } = require(\'./src/calc.js\'); if (add(2, 3) !== 5) process.exit(1);"',
            expectedExitCode: 0,
          },
        ],
        trajectory: [
          { rule: 'max_turns', param: 5 },
          { rule: 'no_security_violations', param: true },
        ],
      },
    };

    const harness = new AgentHarness();
    const { report } = await harness.runScenario(scenario, async (ctx) => {
      // Turn 1: Inspect files
      ctx.recorder.startTurn('Turn 1: Inspect files');
      const inspect = await ctx.executor.execute('cat src/calc.js');
      ctx.recorder.recordToolCall('shell', { cmd: 'cat src/calc.js' }, inspect, 10);
      ctx.recorder.completeTurn('Found broken implementation', { promptTokens: 50, completionTokens: 20, totalTokens: 70 });

      // Turn 2: Fix bug
      ctx.recorder.startTurn('Turn 2: Fix bug');
      await ctx.workspace.writeFile('src/calc.js', 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n');
      await ctx.workspace.writeFile('README.md', '# Calculator\nA simple mathematical calculator.\n');
      ctx.recorder.recordToolCall('write_file', { path: 'src/calc.js' }, { success: true }, 15);
      ctx.recorder.recordToolCall('write_file', { path: 'README.md' }, { success: true }, 10);
      ctx.recorder.completeTurn('Fixed add function and generated README.md', { promptTokens: 60, completionTokens: 30, totalTokens: 90 });

      // Turn 3: Verify
      ctx.recorder.startTurn('Turn 3: Run verification');
      const verifyRun = await ctx.executor.execute('node -e "const { add } = require(\'./src/calc.js\'); if (add(2, 3) !== 5) process.exit(1);"');
      ctx.recorder.recordToolCall('shell', { cmd: 'verify' }, verifyRun, 20);
      ctx.recorder.completeTurn('Verified successfully', { promptTokens: 40, completionTokens: 15, totalTokens: 55 });
    });

    expect(report.passed).toBe(true);
    expect(report.metrics.passedAssertions).toBe(5);
    expect(report.metrics.failedAssertions).toBe(0);
    expect(report.metrics.totalTurns).toBe(3);
    expect(report.trajectorySummary.completed).toBe(true);
  });

  it('correctly fails when an agent fails to meet assertions', async () => {
    const scenario: ScenarioDefinition = {
      id: 'e2e-fail-test',
      name: 'Failing Scenario Test',
      description: 'Agent fails to produce required file',
      version: '1.0.0',
      task: { instruction: 'Create missing-file.txt' },
      assertions: {
        files: [{ path: 'missing-file.txt', shouldExist: true }],
      },
    };

    const harness = new AgentHarness();
    const { report } = await harness.runScenario(scenario, async (ctx) => {
      ctx.recorder.startTurn('Turn 1: Do nothing');
      ctx.recorder.completeTurn('I forgot to create the file', { promptTokens: 10, completionTokens: 10, totalTokens: 20 });
    });

    expect(report.passed).toBe(false);
    expect(report.metrics.failedAssertions).toBe(1);
    expect(report.assertionResults[0].passed).toBe(false);
  });
});

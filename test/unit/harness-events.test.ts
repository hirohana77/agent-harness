import { describe, it, expect } from 'vitest';
import { AgentHarness } from '../../src/core/harness.js';
import { TrajectoryEventBus } from '../../src/events/bus.js';
import { BufferedStreamObserver } from '../../src/events/observers/buffer.js';
import { ScenarioDefinition } from '../../src/core/types.js';

describe('AgentHarness Event Streaming Integration', () => {
  const minimalScenario: ScenarioDefinition = {
    id: 'events-integration-test',
    name: 'Events Integration Test Scenario',
    workspace: {
      cleanup: true,
      gitInit: false,
      initialFiles: {
        'index.js': 'console.log("hello world");',
      },
    },
    task: {
      instruction: 'Read file and execute command',
    },
    budgets: {
      maxTurns: 3,
      maxTokens: 1000,
    },
    assertions: {
      files: [
        {
          path: 'index.js',
          shouldExist: true,
          contains: 'hello',
        },
      ],
    },
  };

  it('should stream all lifecycle events through attached observers during runScenario', async () => {
    const buffer = new BufferedStreamObserver();
    const eventBus = new TrajectoryEventBus();

    const { report } = await AgentHarness.runScenario(
      minimalScenario,
      async (ctx) => {
        expect(ctx.eventBus).toBeDefined();

        ctx.recorder.startTurn('Execute initial inspection');
        ctx.recorder.notifyToolStart('bash', { command: 'node index.js' });
        const res = await ctx.executor.execute('node index.js');
        ctx.recorder.recordToolCall(
          'bash',
          { command: 'node index.js' },
          { success: res.success, output: res.output, exitCode: res.exitCode },
          10
        );
        ctx.recorder.completeTurn('Inspection completed', {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        });
      },
      { eventBus, observers: [buffer] }
    );

    expect(report.passed).toBe(true);

    const events = buffer.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(5);

    const types = events.map((e) => e.type);
    expect(types).toContain('scenario:start');
    expect(types).toContain('turn:start');
    expect(types).toContain('tool:start');
    expect(types).toContain('tool:end');
    expect(types).toContain('turn:complete');
    expect(types).toContain('status:change');
    expect(types).toContain('scenario:complete');
  });

  it('should emit budget warning when turn or token threshold reaches 80%', async () => {
    const buffer = new BufferedStreamObserver();

    await AgentHarness.runScenario(
      {
        ...minimalScenario,
        budgets: {
          maxTurns: 2,
          maxTokens: 200,
        },
      },
      async (ctx) => {
        // Turn 1
        ctx.recorder.startTurn('Turn 1');
        ctx.recorder.completeTurn('Done 1', {
          promptTokens: 90,
          completionTokens: 80,
          totalTokens: 170, // 170 / 200 = 85%
        });

        // Turn 2: 2/2 = 100% of maxTurns
        ctx.recorder.startTurn('Turn 2');
        ctx.recorder.completeTurn('Done 2', {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        });
      },
      { observers: [buffer] }
    );

    const warnings = buffer.getEventsByType('budget:warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.budgetType === 'tokens' || w.budgetType === 'turns')).toBe(true);
  });

  it('should emit error event when agent execution throws', async () => {
    const buffer = new BufferedStreamObserver();

    await AgentHarness.runScenario(
      minimalScenario,
      async (ctx) => {
        ctx.recorder.startTurn('Failing turn');
        throw new Error('Simulated Agent Failure');
      },
      { observers: [buffer] }
    );

    const errorEvents = buffer.getEventsByType('error');
    expect(errorEvents.length).toBe(1);
    expect(errorEvents[0].errorMessage).toBe('Simulated Agent Failure');
    expect(errorEvents[0].phase).toBe('agent_execution');
  });
});

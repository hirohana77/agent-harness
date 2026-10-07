import { describe, it, expect } from 'vitest';
import { AgentHarness } from '../../src/core/harness.js';
import { ScenarioDefinition } from '../../src/core/types.js';
import { SteeringController } from '../../src/steering/controller.js';
import { TrajectoryEventBus } from '../../src/events/bus.js';

describe('AgentHarness with SteeringController Integration', () => {
  const baseScenario: ScenarioDefinition = {
    id: 'steering-integration-scenario',
    name: 'Steering Integration Test',
    description: 'Scenario testing interactive steering and breakpoints',
    version: '1.0.0',
    task: {
      instruction: 'Verify steering controller breakpoint and intervention functionality',
    },
    workspace: {
      initialFiles: {
        'initial.txt': 'hello original world',
      },
      cleanup: true,
    },
    sandbox: {
      type: 'local',
    },
    assertions: {
      files: [
        {
          path: 'result.txt',
          shouldExist: true,
          contains: ['success'],
        },
      ],
    },
  };

  it('pauses at breakpoint and resumes smoothly when intervention is continue', async () => {
    const eventBus = new TrajectoryEventBus();
    const steering = new SteeringController({ eventBus });

    steering.addBreakpoint({
      id: 'bp_write',
      type: 'tool',
      toolPattern: 'write_file',
      once: true,
    });

    let breakpointHitEventCount = 0;
    eventBus.on('breakpoint:hit', () => {
      breakpointHitEventCount++;
      setTimeout(() => {
        steering.resume();
      }, 30);
    });

    const { report, trajectory } = await AgentHarness.runScenario(
      baseScenario,
      async (ctx) => {
        ctx.recorder.startTurn('Step 1: Write file');
        await ctx.tools.call('write_file', {
          path: 'result.txt',
          content: 'success from agent',
        });
        ctx.recorder.completeTurn();
      },
      { eventBus, steering }
    );

    expect(breakpointHitEventCount).toBe(1);
    expect(report.passed).toBe(true);
    expect(trajectory.status).toBe('completed');
  });

  it('allows overriding tool result during breakpoint pause', async () => {
    const eventBus = new TrajectoryEventBus();
    const steering = new SteeringController({ eventBus });

    steering.addBreakpoint({
      id: 'bp_exec',
      type: 'tool',
      toolPattern: 'exec_command',
    });

    eventBus.on('breakpoint:hit', () => {
      setTimeout(() => {
        steering.intervene({
          type: 'override_tool',
          overrideResult: {
            success: true,
            output: 'mocked command output: status=healthy',
            exitCode: 0,
          },
          prompt: 'Operator advice: proceed to save result file',
        });
      }, 30);
    });

    const { report, trajectory } = await AgentHarness.runScenario(
      baseScenario,
      async (ctx) => {
        ctx.recorder.startTurn('Step 1: Execute external command');
        const res = await ctx.tools.call('exec_command', { cmd: 'non_existent_binary_xyz' });
        expect(res.output).toContain('mocked command output: status=healthy');

        const prompts = ctx.steering?.consumeInjectedPrompts() || [];
        expect(prompts).toContain('Operator advice: proceed to save result file');

        ctx.recorder.completeTurn();

        ctx.recorder.startTurn('Step 2: Save result');
        await ctx.tools.call('write_file', {
          path: 'result.txt',
          content: 'success override',
        });
        ctx.recorder.completeTurn();
      },
      { eventBus, steering }
    );

    expect(report.passed).toBe(true);
    expect(trajectory.status).toBe('completed');
  });

  it('aborts scenario execution when abort intervention is issued', async () => {
    const eventBus = new TrajectoryEventBus();
    const steering = new SteeringController({ eventBus });

    steering.addBreakpoint({
      id: 'bp_abort_test',
      type: 'tool',
      toolPattern: 'read_file',
    });

    eventBus.on('breakpoint:hit', () => {
      setTimeout(() => {
        steering.intervene({
          type: 'abort',
          reason: 'Operator aborted due to safety guardrail',
        });
      }, 20);
    });

    const { report, trajectory } = await AgentHarness.runScenario(
      baseScenario,
      async (ctx) => {
        ctx.recorder.startTurn('Step 1: Reading file');
        await ctx.tools.call('read_file', { path: 'initial.txt' });
        ctx.recorder.completeTurn();
      },
      { eventBus, steering }
    );

    expect(trajectory.status).toBe('aborted');
    expect(report.passed).toBe(false);
  });
});

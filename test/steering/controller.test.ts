import { describe, it, expect, beforeEach } from 'vitest';
import { SteeringController, SteeringAbortError } from '../../src/steering/controller.js';
import { TrajectoryEventBus } from '../../src/events/bus.js';
import { TrajectoryEvent } from '../../src/events/types.js';

describe('SteeringController', () => {
  let controller: SteeringController;
  let eventBus: TrajectoryEventBus;

  beforeEach(() => {
    eventBus = new TrajectoryEventBus();
    controller = new SteeringController({ eventBus, scenarioId: 'test_scenario' });
  });

  it('initializes with default idle state and can start', () => {
    const state = controller.getState();
    expect(state.status).toBe('idle');
    expect(state.isPaused).toBe(false);
    expect(state.injectedPrompts).toHaveLength(0);

    controller.start();
    expect(controller.getState().status).toBe('running');
  });

  it('handles manual pause and resume with event emission', async () => {
    const events: TrajectoryEvent[] = [];
    eventBus.on('*', (e) => events.push(e));

    controller.pause('Manual inspection needed');
    const state = controller.getState();
    expect(state.isPaused).toBe(true);
    expect(state.status).toBe('paused');
    expect(state.activeBreakpointHit?.reason).toBe('Manual inspection needed');

    expect(events.some((e) => e.type === 'breakpoint:hit')).toBe(true);

    // Resume execution
    controller.resume({ type: 'continue' });
    expect(controller.getState().isPaused).toBe(false);
  });

  it('manages injected prompts queue', () => {
    controller.injectPrompt('Focus on unit tests first');
    controller.injectPrompt('Do not touch README.md');

    expect(controller.getInjectedPrompts()).toEqual([
      'Focus on unit tests first',
      'Do not touch README.md',
    ]);

    const consumed = controller.consumeInjectedPrompts();
    expect(consumed).toHaveLength(2);
    expect(controller.getInjectedPrompts()).toHaveLength(0);
  });

  it('intercepts tool when breakpoint matches and resumes on intervention', async () => {
    controller.addBreakpoint({
      id: 'bp_bash',
      type: 'tool',
      toolPattern: 'bash',
    });

    const events: TrajectoryEvent[] = [];
    eventBus.on('*', (e) => events.push(e));

    // Asynchronously simulate intervention after breakpoint is hit
    setTimeout(() => {
      expect(controller.getState().isPaused).toBe(true);
      controller.resume();
    }, 50);

    const decision = await controller.interceptTool('bash', { command: 'echo 123' });
    expect(decision.action).toBe('continue');
    expect(decision.shouldExecuteNative).toBe(true);
    expect(events.some((e) => e.type === 'breakpoint:hit')).toBe(true);
    expect(events.some((e) => e.type === 'breakpoint:resume')).toBe(true);
  });

  it('overrides tool output when intervention is override_tool', async () => {
    controller.addBreakpoint({
      id: 'bp_api',
      type: 'tool',
      toolPattern: 'fetch_data',
    });

    setTimeout(() => {
      controller.intervene({
        type: 'override_tool',
        overrideResult: {
          success: true,
          output: '{"status": "intercepted_and_mocked"}',
          exitCode: 0,
        },
        prompt: 'Use the mocked response to proceed',
      });
    }, 40);

    const decision = await controller.interceptTool('fetch_data', { url: 'https://example.com' });
    expect(decision.action).toBe('override_tool');
    expect(decision.shouldExecuteNative).toBe(false);
    expect(decision.overrideResult?.output).toBe('{"status": "intercepted_and_mocked"}');
    expect(controller.getInjectedPrompts()).toContain('Use the mocked response to proceed');
  });

  it('skips tool execution when intervention is skip_tool', async () => {
    controller.addBreakpoint({
      id: 'bp_deploy',
      type: 'tool',
      toolPattern: 'deploy_to_cloud',
    });

    setTimeout(() => {
      controller.intervene({
        type: 'skip_tool',
        reason: 'Skip cloud deployment in local test',
      });
    }, 40);

    const decision = await controller.interceptTool('deploy_to_cloud', {});
    expect(decision.action).toBe('skip_tool');
    expect(decision.shouldExecuteNative).toBe(false);
    expect(decision.skipResult?.success).toBe(true);
  });

  it('aborts execution when intervention is abort', async () => {
    controller.addBreakpoint({
      id: 'bp_danger',
      type: 'tool',
      toolPattern: 'danger_action',
    });

    setTimeout(() => {
      controller.intervene({
        type: 'abort',
        reason: 'Dangerous operation aborted by operator',
      });
    }, 30);

    await expect(controller.interceptTool('danger_action', {})).rejects.toThrow(
      SteeringAbortError
    );
    expect(controller.getState().status).toBe('aborted');
  });

  it('tracks consecutive errors and resets on success', () => {
    controller.recordError();
    controller.recordError();
    expect(controller.buildEvaluationContext().consecutiveErrors).toBe(2);

    controller.recordSuccess();
    expect(controller.buildEvaluationContext().consecutiveErrors).toBe(0);
  });
});

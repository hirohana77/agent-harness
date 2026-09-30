import { describe, it, expect, vi } from 'vitest';
import { TrajectoryEventBus } from '../../src/events/bus.js';
import { TurnStartEvent, ToolEndEvent, ErrorEvent } from '../../src/events/types.js';

describe('TrajectoryEventBus', () => {
  it('should deliver events to exact-match listeners', () => {
    const bus = new TrajectoryEventBus();
    const calls: TurnStartEvent[] = [];

    bus.on<TurnStartEvent>('turn:start', (evt) => {
      calls.push(evt);
    });

    const evt1 = bus.createEvent<TurnStartEvent>({
      type: 'turn:start',
      scenarioId: 'test-scenario',
      turnNumber: 1,
      prompt: 'Fix the bug',
    });

    bus.emit(evt1);

    expect(calls.length).toBe(1);
    expect(calls[0].turnNumber).toBe(1);
    expect(calls[0].id).toBeDefined();
    expect(calls[0].timestamp).toBeDefined();
  });

  it('should support prefix wildcards and global wildcard', () => {
    const bus = new TrajectoryEventBus();
    const toolEvents: any[] = [];
    const allEvents: any[] = [];

    bus.on('tool:*', (evt) => toolEvents.push(evt));
    bus.on('*', (evt) => allEvents.push(evt));

    const toolStart = bus.createEvent({
      type: 'tool:start',
      scenarioId: 'test-scenario',
      callId: 'call_1',
      toolName: 'bash',
      arguments: { cmd: 'ls' },
      turnNumber: 1,
    });

    const toolEnd = bus.createEvent<ToolEndEvent>({
      type: 'tool:end',
      scenarioId: 'test-scenario',
      callId: 'call_1',
      toolName: 'bash',
      arguments: { cmd: 'ls' },
      durationMs: 10,
      turnNumber: 1,
    });

    const turnStart = bus.createEvent<TurnStartEvent>({
      type: 'turn:start',
      scenarioId: 'test-scenario',
      turnNumber: 1,
      prompt: 'hello',
    });

    bus.emit(toolStart);
    bus.emit(toolEnd);
    bus.emit(turnStart);

    expect(toolEvents.length).toBe(2);
    expect(toolEvents[0].type).toBe('tool:start');
    expect(toolEvents[1].type).toBe('tool:end');
    expect(allEvents.length).toBe(3);
  });

  it('should handle once() listeners correctly', () => {
    const bus = new TrajectoryEventBus();
    let count = 0;

    bus.once('turn:start', () => {
      count++;
    });

    const evt = bus.createEvent<TurnStartEvent>({
      type: 'turn:start',
      scenarioId: 'test-scenario',
      turnNumber: 1,
      prompt: 'once prompt',
    });

    bus.emit(evt);
    bus.emit(evt);

    expect(count).toBe(1);
  });

  it('should allow unsubscribing via returned callback or off()', () => {
    const bus = new TrajectoryEventBus();
    let count1 = 0;
    let count2 = 0;

    const unsub1 = bus.on('turn:start', () => {
      count1++;
    });

    const listener2 = () => {
      count2++;
    };
    bus.on('turn:start', listener2);

    expect(bus.listenerCount('turn:start')).toBe(2);

    unsub1();
    expect(bus.listenerCount('turn:start')).toBe(1);

    const evt = bus.createEvent<TurnStartEvent>({
      type: 'turn:start',
      scenarioId: 'test-scenario',
      turnNumber: 1,
      prompt: 'p',
    });

    bus.emit(evt);
    expect(count1).toBe(0);
    expect(count2).toBe(1);

    bus.off('turn:start', listener2);
    expect(bus.listenerCount('turn:start')).toBe(0);

    bus.emit(evt);
    expect(count2).toBe(1);
  });

  it('should isolate listener errors without crashing emit or other listeners', () => {
    const errorHandler = vi.fn();
    const bus = new TrajectoryEventBus({ onError: errorHandler });

    let normalCalled = false;
    bus.on('turn:start', () => {
      throw new Error('Listener crash!');
    });
    bus.on('turn:start', () => {
      normalCalled = true;
    });

    const evt = bus.createEvent<TurnStartEvent>({
      type: 'turn:start',
      scenarioId: 'test-scenario',
      turnNumber: 1,
      prompt: 'safe',
    });

    expect(() => bus.emit(evt)).not.toThrow();
    expect(normalCalled).toBe(true);
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  it('should support emitAsync awaiting all asynchronous handlers', async () => {
    const bus = new TrajectoryEventBus();
    const order: number[] = [];

    bus.on('error', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });

    bus.on('error', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(2);
    });

    const errEvt = bus.createEvent<ErrorEvent>({
      type: 'error',
      scenarioId: 'test-scenario',
      phase: 'test',
      errorMessage: 'failure',
    });

    await bus.emitAsync(errEvt);
    expect(order).toEqual([2, 1]);
  });
});

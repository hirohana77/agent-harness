import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { TrajectoryEventBus } from '../../src/events/bus.js';
import { BufferedStreamObserver } from '../../src/events/observers/buffer.js';
import { JsonLinesStreamObserver } from '../../src/events/observers/jsonl.js';
import { LiveConsoleObserver } from '../../src/events/observers/console.js';
import { TurnStartEvent, ToolEndEvent } from '../../src/events/types.js';

describe('Streaming Observers', () => {
  describe('BufferedStreamObserver', () => {
    it('should collect events and enforce maxSize boundary', () => {
      const observer = new BufferedStreamObserver({ maxSize: 3 });
      const bus = new TrajectoryEventBus();
      bus.on('*', (e) => observer.onEvent(e));

      for (let i = 1; i <= 5; i++) {
        bus.emit(
          bus.createEvent<TurnStartEvent>({
            type: 'turn:start',
            scenarioId: 'test',
            turnNumber: i,
            prompt: `Prompt ${i}`,
          })
        );
      }

      expect(observer.size()).toBe(3);
      const events = observer.getEvents() as TurnStartEvent[];
      expect(events[0].turnNumber).toBe(3);
      expect(events[1].turnNumber).toBe(4);
      expect(events[2].turnNumber).toBe(5);
    });

    it('should filter events by type and support drain / replay', () => {
      const observer = new BufferedStreamObserver();
      const bus = new TrajectoryEventBus();
      bus.on('*', (e) => observer.onEvent(e));

      bus.emit(
        bus.createEvent<TurnStartEvent>({
          type: 'turn:start',
          scenarioId: 'test',
          turnNumber: 1,
          prompt: 'Turn 1',
        })
      );
      bus.emit(
        bus.createEvent<ToolEndEvent>({
          type: 'tool:end',
          scenarioId: 'test',
          callId: 'call_1',
          toolName: 'read_file',
          arguments: {},
          durationMs: 5,
          turnNumber: 1,
        })
      );

      const turnEvents = observer.getEventsByType('turn:start');
      expect(turnEvents.length).toBe(1);
      expect(turnEvents[0].type).toBe('turn:start');

      const targetBus = new TrajectoryEventBus();
      const replayed: any[] = [];
      targetBus.on('*', (e) => replayed.push(e));

      observer.replay(targetBus);
      expect(replayed.length).toBe(2);

      const drained = observer.drain();
      expect(drained.length).toBe(2);
      expect(observer.size()).toBe(0);
    });
  });

  describe('JsonLinesStreamObserver', () => {
    it('should stream events to a JSON lines file', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-jsonl-test-'));
      const filePath = path.join(tmpDir, 'events.jsonl');

      const observer = new JsonLinesStreamObserver({ filePath, immediate: true });
      const bus = new TrajectoryEventBus();
      bus.on('*', (e) => observer.onEvent(e));

      bus.emit(
        bus.createEvent<TurnStartEvent>({
          type: 'turn:start',
          scenarioId: 's1',
          turnNumber: 1,
          prompt: 'NDJSON test',
        })
      );

      bus.emit(
        bus.createEvent<ToolEndEvent>({
          type: 'tool:end',
          scenarioId: 's1',
          callId: 'call_jsonl',
          toolName: 'exec',
          arguments: { cmd: 'pwd' },
          durationMs: 12,
          turnNumber: 1,
        })
      );

      await observer.close();

      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);

      const parsed1 = JSON.parse(lines[0]);
      expect(parsed1.type).toBe('turn:start');
      expect(parsed1.scenarioId).toBe('s1');

      const parsed2 = JSON.parse(lines[1]);
      expect(parsed2.type).toBe('tool:end');
      expect(parsed2.toolName).toBe('exec');

      await fs.rm(tmpDir, { recursive: true, force: true });
    });
  });

  describe('LiveConsoleObserver', () => {
    it('should format all event types without errors', () => {
      const logs: string[] = [];
      const observer = new LiveConsoleObserver({
        verbose: true,
        showTimestamp: true,
        logger: (msg) => logs.push(msg),
      });

      const bus = new TrajectoryEventBus();
      bus.on('*', (e) => observer.onEvent(e));

      bus.emit(
        bus.createEvent({
          type: 'scenario:start',
          scenarioId: 'demo',
          scenarioName: 'Demo Scenario',
        })
      );
      bus.emit(
        bus.createEvent<TurnStartEvent>({
          type: 'turn:start',
          scenarioId: 'demo',
          turnNumber: 1,
          prompt: 'Solve the problem',
          thought: 'Analyzing code structure',
        })
      );
      bus.emit(
        bus.createEvent({
          type: 'tool:start',
          scenarioId: 'demo',
          callId: 'c1',
          toolName: 'bash',
          arguments: { cmd: 'node -v' },
          turnNumber: 1,
        })
      );
      bus.emit(
        bus.createEvent<ToolEndEvent>({
          type: 'tool:end',
          scenarioId: 'demo',
          callId: 'c1',
          toolName: 'bash',
          arguments: { cmd: 'node -v' },
          result: { success: true, output: 'v20.0.0', exitCode: 0 },
          durationMs: 25,
          turnNumber: 1,
        })
      );
      bus.emit(
        bus.createEvent({
          type: 'budget:warning',
          scenarioId: 'demo',
          budgetType: 'tokens',
          usage: 8500,
          limit: 10000,
          ratio: 0.85,
          message: 'Tokens reached 85%',
        })
      );
      bus.emit(
        bus.createEvent({
          type: 'status:change',
          scenarioId: 'demo',
          previousStatus: 'running',
          newStatus: 'completed',
        })
      );
      bus.emit(
        bus.createEvent({
          type: 'scenario:complete',
          scenarioId: 'demo',
          status: 'completed',
          passed: true,
          durationMs: 120,
        })
      );

      expect(logs.length).toBeGreaterThanOrEqual(7);
      expect(logs.some((l) => l.includes('SCENARIO START'))).toBe(true);
      expect(logs.some((l) => l.includes('TURN #1'))).toBe(true);
      expect(logs.some((l) => l.includes('TOOL'))).toBe(true);
      expect(logs.some((l) => l.includes('BUDGET WARNING'))).toBe(true);
      expect(logs.some((l) => l.includes('SCENARIO FINISHED'))).toBe(true);
    });
  });
});

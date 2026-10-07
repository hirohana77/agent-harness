import { describe, it, expect, beforeEach } from 'vitest';
import { BreakpointEngine } from '../../src/steering/engine.js';
import { BreakpointEvaluationContext, BreakpointRule } from '../../src/steering/types.js';

describe('BreakpointEngine', () => {
  let engine: BreakpointEngine;

  beforeEach(() => {
    engine = new BreakpointEngine();
  });

  it('manages breakpoint rules correctly', () => {
    const bp = engine.addBreakpoint({
      id: 'bp_1',
      name: 'Bash check',
      type: 'tool',
      toolPattern: 'bash',
    });

    expect(bp.id).toBe('bp_1');
    expect(bp.enabled).toBe(true);
    expect(bp.hitCount).toBe(0);
    expect(engine.getBreakpoints()).toHaveLength(1);
    expect(engine.getBreakpoint('bp_1')).toBeDefined();

    engine.setBreakpointEnabled('bp_1', false);
    expect(engine.getBreakpoint('bp_1')?.enabled).toBe(false);

    expect(engine.removeBreakpoint('bp_1')).toBe(true);
    expect(engine.getBreakpoints()).toHaveLength(0);
  });

  it('matches tool breakpoint with regex and argument matches', async () => {
    engine.addBreakpoint({
      id: 'bp_tool',
      type: 'tool',
      toolPattern: '^exec_.*',
      argumentMatch: {
        command: 'rm -rf /',
      },
    });

    const ctxMismatchName: BreakpointEvaluationContext = {
      scenarioId: 'test_s',
      turnNumber: 1,
      toolName: 'read_file',
      consecutiveErrors: 0,
    };
    expect(await engine.evaluate(ctxMismatchName)).toBeNull();

    const ctxMismatchArg: BreakpointEvaluationContext = {
      scenarioId: 'test_s',
      turnNumber: 1,
      toolName: 'exec_command',
      toolArgs: { command: 'ls -la' },
      consecutiveErrors: 0,
    };
    expect(await engine.evaluate(ctxMismatchArg)).toBeNull();

    const ctxMatch: BreakpointEvaluationContext = {
      scenarioId: 'test_s',
      turnNumber: 1,
      toolName: 'exec_command',
      toolArgs: { command: 'rm -rf /' },
      consecutiveErrors: 0,
    };
    const hit = await engine.evaluate(ctxMatch);
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe('bp_tool');
    expect(hit?.hitCount).toBe(1);
  });

  it('triggers on consecutive error threshold', async () => {
    engine.addBreakpoint({
      id: 'bp_err',
      type: 'error_count',
      errorThreshold: 3,
    });

    const ctx1: BreakpointEvaluationContext = {
      scenarioId: 'test_s',
      turnNumber: 1,
      consecutiveErrors: 2,
    };
    expect(await engine.evaluate(ctx1)).toBeNull();

    const ctx2: BreakpointEvaluationContext = {
      scenarioId: 'test_s',
      turnNumber: 1,
      consecutiveErrors: 3,
    };
    const hit = await engine.evaluate(ctx2);
    expect(hit?.id).toBe('bp_err');
  });

  it('triggers on turn threshold', async () => {
    engine.addBreakpoint({
      id: 'bp_turn',
      type: 'turn',
      turnThreshold: 5,
    });

    expect(
      await engine.evaluate({
        scenarioId: 's',
        turnNumber: 4,
        consecutiveErrors: 0,
      })
    ).toBeNull();

    const hit = await engine.evaluate({
      scenarioId: 's',
      turnNumber: 5,
      consecutiveErrors: 0,
    });
    expect(hit?.id).toBe('bp_turn');
  });

  it('triggers on budget ratio threshold', async () => {
    engine.addBreakpoint({
      id: 'bp_budget',
      type: 'budget_ratio',
      budgetRatioThreshold: 0.85,
    });

    expect(
      await engine.evaluate({
        scenarioId: 's',
        turnNumber: 1,
        consecutiveErrors: 0,
        budgetRatio: 0.8,
      })
    ).toBeNull();

    const hit = await engine.evaluate({
      scenarioId: 's',
      turnNumber: 1,
      consecutiveErrors: 0,
      budgetRatio: 0.9,
    });
    expect(hit?.id).toBe('bp_budget');
  });

  it('supports custom predicate condition', async () => {
    engine.addBreakpoint({
      id: 'bp_custom',
      type: 'custom',
      predicate: (ctx) => ctx.metadata?.flag === true,
    });

    expect(
      await engine.evaluate({
        scenarioId: 's',
        turnNumber: 1,
        consecutiveErrors: 0,
        metadata: { flag: false },
      })
    ).toBeNull();

    const hit = await engine.evaluate({
      scenarioId: 's',
      turnNumber: 1,
      consecutiveErrors: 0,
      metadata: { flag: true },
    });
    expect(hit?.id).toBe('bp_custom');
  });

  it('disables breakpoint automatically when once is true', async () => {
    engine.addBreakpoint({
      id: 'bp_once',
      type: 'tool',
      toolPattern: 'read_file',
      once: true,
    });

    const ctx: BreakpointEvaluationContext = {
      scenarioId: 's',
      turnNumber: 1,
      toolName: 'read_file',
      consecutiveErrors: 0,
    };

    const firstHit = await engine.evaluate(ctx);
    expect(firstHit?.id).toBe('bp_once');
    expect(engine.getBreakpoint('bp_once')?.enabled).toBe(false);

    const secondHit = await engine.evaluate(ctx);
    expect(secondHit).toBeNull();
  });
});

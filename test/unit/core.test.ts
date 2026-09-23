import { describe, it, expect } from 'vitest';
import { ScenarioDefinitionSchema, TrajectorySchema } from '../../src/core/schemas.js';
import { SecurityViolationError, BudgetExceededError, HarnessError } from '../../src/core/errors.js';

describe('Core Schemas and Errors', () => {
  it('validates a minimal valid scenario definition', () => {
    const raw = {
      id: 'fix-bug-001',
      name: 'Fix array out of bounds bug',
      task: {
        instruction: 'Fix the index error in src/index.ts',
      },
    };

    const parsed = ScenarioDefinitionSchema.parse(raw);
    expect(parsed.id).toBe('fix-bug-001');
    expect(parsed.budgets.maxTurns).toBe(20);
    expect(parsed.security.deniedCommands.length).toBeGreaterThan(0);
    expect(parsed.workspace.gitInit).toBe(true);
  });

  it('rejects invalid scenario IDs', () => {
    const invalid = {
      id: 'invalid id with spaces!',
      name: 'Bad ID',
      task: { instruction: 'Do something' },
    };

    expect(() => ScenarioDefinitionSchema.parse(invalid)).toThrow();
  });

  it('validates trajectory structures correctly', () => {
    const traj = {
      scenarioId: 'test-scenario',
      startedAt: new Date().toISOString(),
      turns: [
        {
          turnNumber: 1,
          prompt: 'Please fix the bug',
          toolCalls: [
            {
              callId: 'call-1',
              toolName: 'exec',
              arguments: { cmd: 'cat file.txt' },
              result: { success: true, output: 'hello world' },
              durationMs: 45,
            },
          ],
        },
      ],
    };

    const parsed = TrajectorySchema.parse(traj);
    expect(parsed.turns.length).toBe(1);
    expect(parsed.turns[0].toolCalls[0].toolName).toBe('exec');
  });

  it('instantiates custom domain errors properly', () => {
    const secErr = new SecurityViolationError('Forbidden command: rm -rf /', { cmd: 'rm -rf /' });
    expect(secErr).toBeInstanceOf(HarnessError);
    expect(secErr.name).toBe('SecurityViolationError');
    expect(secErr.code).toBe('SECURITY_VIOLATION');
    expect(secErr.message).toContain('Forbidden command');

    const budgetErr = new BudgetExceededError('Max turns exceeded: 20');
    expect(budgetErr.code).toBe('BUDGET_EXCEEDED');
  });
});

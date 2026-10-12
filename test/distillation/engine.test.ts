import { describe, expect, it } from 'vitest';
import { PolicyDistillationEngine } from '../../src/distillation/engine.js';
import type { CanonicalTrajectory } from '../../src/consensus/types.js';

describe('PolicyDistillationEngine', () => {
  const canonicalSample: CanonicalTrajectory = {
    scenarioId: 'e2e-distill-scenario',
    description: 'End to end scenario',
    confidenceScore: 88.0,
    synthesizedFromCount: 3,
    prunedOutlierStepsCount: 1,
    totalSteps: 2,
    turns: [
      {
        turnNumber: 1,
        instruction: 'Find and fix memory leak in worker',
        thought: 'Search for interval timers',
        toolCalls: [
          {
            toolName: 'grep_search',
            arguments: { pattern: 'setInterval' },
            result: { success: true, output: 'worker.ts: setInterval(tick, 1000)' },
          },
        ],
      },
      {
        turnNumber: 2,
        instruction: 'Find and fix memory leak in worker',
        thought: 'Add clearInterval in cleanup handler',
        toolCalls: [
          {
            toolName: 'edit_file',
            arguments: { path: 'worker.ts' },
            result: { success: true, output: 'Edited worker.ts' },
          },
        ],
        assistantMessage: 'Memory leak resolved.',
      },
    ],
  };

  it('runs full distillation, dispatcher tracking, and formatting pipeline', () => {
    const engine = new PolicyDistillationEngine({
      tokenBudget: 500,
      includeNegativeGuidance: true,
      includeSteeringRules: true,
    });

    // 1. Distill policy
    const policy = engine.distillFromCanonical(canonicalSample);
    expect(policy.metadata.scenarioId).toBe('e2e-distill-scenario');
    expect(policy.milestones.length).toBe(2);

    // 2. Format policy across various targets
    const markdown = engine.formatPolicy(policy, 'markdown') as string;
    expect(markdown).toContain('Strategic Execution Guidance');

    const anthropicXml = engine.formatPolicy(policy, 'anthropic' as any) as string;
    expect(anthropicXml).toContain('<distilled_guidance');

    const fewShot = engine.formatPolicy(policy, 'fewshot') as any[];
    expect(Array.isArray(fewShot)).toBe(true);

    const steering = engine.formatPolicy(policy, 'steering') as any;
    expect(steering.rules).toBeDefined();

    const json = engine.formatPolicy(policy, 'json') as string;
    expect(JSON.parse(json).metadata.scenarioId).toBe('e2e-distill-scenario');

    // 3. Create Dispatcher and verify step evaluation
    const dispatcher = engine.createDispatcher(policy);
    expect(dispatcher.getState().status).toBe('tracking');

    const step1Result = dispatcher.evaluateStep({
      turnNumber: 1,
      toolName: 'grep_search',
      arguments: { pattern: 'setInterval' },
      previousResult: { success: true },
    });
    expect(step1Result.action).toBe('milestone_advance');

    const step2Result = dispatcher.evaluateStep({
      turnNumber: 2,
      toolName: 'edit_file',
      arguments: { path: 'worker.ts' },
      previousResult: { success: true },
    });
    expect(step2Result.action).toBe('milestone_advance');
    expect(dispatcher.getState().status).toBe('milestones_complete');
  });
});

import { describe, expect, it } from 'vitest';
import { DynamicGuidanceDispatcher } from '../../src/distillation/dispatcher.js';
import type { DistilledPolicy } from '../../src/distillation/types.js';

describe('DynamicGuidanceDispatcher', () => {
  const samplePolicy: DistilledPolicy = {
    metadata: {
      scenarioId: 'test-scenario',
      source: 'consensus_cluster',
      createdAt: new Date().toISOString(),
      confidenceScore: 90,
      sourceTrajectoriesCount: 4,
      totalMilestones: 3,
      totalAntiPatterns: 2,
      estimatedTokens: 300,
    },
    milestones: [
      {
        id: 'ms-1',
        order: 1,
        name: 'Locate error file',
        description: 'Find error in src directory',
        targetTool: 'find_files',
        argumentPattern: 'src',
        isInvariant: true,
        importance: 'critical',
      },
      {
        id: 'ms-2',
        order: 2,
        name: 'Apply code fix',
        description: 'Edit error line',
        targetTool: 'edit_file',
        isInvariant: true,
        importance: 'critical',
      },
      {
        id: 'ms-3',
        order: 3,
        name: 'Run verification test',
        description: 'Execute npm test',
        targetTool: 'run_tests',
        argumentPattern: 'npm test',
        isInvariant: true,
        importance: 'recommended',
      },
    ],
    antiPatterns: [
      {
        id: 'trap-1',
        name: 'Deadly rm -rf',
        triggerTool: 'bash',
        argumentPattern: 'rm -rf',
        errorKeywords: [],
        severity: 'critical',
        reason: 'Dangerous file removal destructive to workspace.',
        remedyHint: 'Use targeted file deletions or keep intact.',
        occurrenceCount: 2,
      },
      {
        id: 'trap-2',
        name: 'Repeated failing git pull',
        triggerTool: 'git_pull',
        errorKeywords: ['Merge conflict', 'Aborting'],
        severity: 'warning',
        reason: 'Repeated git conflicts detected.',
        remedyHint: 'Resolve working tree changes first.',
        occurrenceCount: 1,
      },
    ],
    steeringRules: [],
  };

  it('initializes state and resets properly', () => {
    const dispatcher = new DynamicGuidanceDispatcher(samplePolicy);
    const state = dispatcher.getState();

    expect(state.currentMilestoneIndex).toBe(0);
    expect(state.completedMilestones).toHaveLength(0);
    expect(state.status).toBe('tracking');
    expect(state.warningsIssued).toBe(0);
    expect(state.blocksTriggered).toBe(0);

    dispatcher.reset();
    expect(dispatcher.getState().currentMilestoneIndex).toBe(0);
  });

  it('intercepts critical anti-pattern and triggers block', () => {
    const dispatcher = new DynamicGuidanceDispatcher(samplePolicy);

    const feedback = dispatcher.evaluateStep({
      turnNumber: 1,
      toolName: 'bash',
      arguments: { command: 'rm -rf node_modules' },
    });

    expect(feedback.action).toBe('block');
    expect(feedback.severity).toBe('critical');
    expect(feedback.patternId).toBe('trap-1');
    expect(feedback.message).toContain('CRITICAL TRAP DETECTED');
    expect(feedback.suggestedAlternative).toContain('targeted file deletions');

    expect(dispatcher.getState().status).toBe('blocked');
    expect(dispatcher.getState().blocksTriggered).toBe(1);
  });

  it('triggers warning on non-critical anti-pattern with error match', () => {
    const dispatcher = new DynamicGuidanceDispatcher(samplePolicy);

    const feedback = dispatcher.evaluateStep({
      turnNumber: 1,
      toolName: 'git_pull',
      arguments: {},
      previousResult: {
        success: false,
        error: 'error: Merge conflict in package.json. Aborting.',
      },
    });

    expect(feedback.action).toBe('warn');
    expect(feedback.severity).toBe('warning');
    expect(feedback.patternId).toBe('trap-2');
    expect(feedback.suggestedAlternative).toContain('Resolve working tree changes');

    expect(dispatcher.getState().warningsIssued).toBe(1);
  });

  it('tracks milestone advancement sequentially to completion', () => {
    const dispatcher = new DynamicGuidanceDispatcher(samplePolicy);

    // Step 1: satisfies milestone 1
    const fb1 = dispatcher.evaluateStep({
      turnNumber: 1,
      toolName: 'find_files',
      arguments: { pattern: 'src/**/*.ts' },
      previousResult: { success: true, output: 'src/main.ts' },
    });

    expect(fb1.action).toBe('milestone_advance');
    expect(fb1.milestoneId).toBe('ms-1');
    expect(dispatcher.getState().currentMilestoneIndex).toBe(1);

    // Step 2: satisfies milestone 2
    const fb2 = dispatcher.evaluateStep({
      turnNumber: 2,
      toolName: 'edit_file',
      arguments: { path: 'src/main.ts' },
      previousResult: { success: true, output: 'ok' },
    });

    expect(fb2.action).toBe('milestone_advance');
    expect(fb2.milestoneId).toBe('ms-2');
    expect(dispatcher.getState().currentMilestoneIndex).toBe(2);

    // Step 3: satisfies milestone 3 (last one)
    const fb3 = dispatcher.evaluateStep({
      turnNumber: 3,
      toolName: 'run_tests',
      arguments: { command: 'npm test -- --silent' },
      previousResult: { success: true, output: 'pass' },
    });

    expect(fb3.action).toBe('milestone_advance');
    expect(fb3.milestoneId).toBe('ms-3');
    expect(dispatcher.getState().status).toBe('milestones_complete');
    expect(dispatcher.getProgressSummary()).toContain('100%');
  });

  it('detects trajectory divergence when exceeding tolerance', () => {
    const dispatcher = new DynamicGuidanceDispatcher(samplePolicy, 2);

    // Irrelevant steps that do not advance milestone 1
    dispatcher.evaluateStep({
      turnNumber: 1,
      toolName: 'random_tool',
      arguments: {},
    });

    const fbDiverge = dispatcher.evaluateStep({
      turnNumber: 2,
      toolName: 'another_tool',
      arguments: {},
    });

    expect(fbDiverge.action).toBe('diverged');
    expect(fbDiverge.severity).toBe('warning');
    expect(dispatcher.getState().status).toBe('diverged');
  });
});

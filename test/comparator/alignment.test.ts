import { describe, expect, it } from 'vitest';
import {
  alignTrajectorySteps,
  calculateStepSimilarity,
  extractTrajectorySteps,
} from '../../src/comparator/alignment.js';
import { Trajectory } from '../../src/core/types.js';

describe('Trajectory Alignment & Step Extraction', () => {
  it('should extract linear sequence of steps from trajectory', () => {
    const traj: Trajectory = {
      scenarioId: 'test-scenario',
      startedAt: new Date().toISOString(),
      durationMs: 1500,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Find files',
          thought: 'I should run find',
          toolCalls: [
            {
              callId: 'c1',
              toolName: 'bash',
              arguments: { command: 'find . -name "*.ts"' },
              result: { success: true, output: 'src/index.ts\n' },
            },
          ],
          assistantMessage: 'I found src/index.ts',
          tokensUsed: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        },
        {
          turnNumber: 2,
          prompt: 'Check contents',
          toolCalls: [
            {
              callId: 'c2',
              toolName: 'read_file',
              arguments: { path: 'src/index.ts' },
              result: { success: true, output: 'export const x = 1;' },
            },
          ],
          tokensUsed: { promptTokens: 12, completionTokens: 10, totalTokens: 22 },
        },
      ],
      summary: {
        totalTurns: 2,
        totalToolCalls: 2,
        totalTokens: 47,
        costUsd: 0.001,
        completed: true,
      },
    };

    const steps = extractTrajectorySteps(traj);
    expect(steps).toHaveLength(3); // turn 1 tool, turn 1 msg, turn 2 tool
    expect(steps[0]).toMatchObject({
      turnNumber: 1,
      stepIndex: 0,
      stepType: 'tool',
      toolName: 'bash',
    });
    expect(steps[1]).toMatchObject({
      turnNumber: 1,
      stepIndex: 1,
      stepType: 'turn_end',
      assistantMessage: 'I found src/index.ts',
    });
    expect(steps[2]).toMatchObject({
      turnNumber: 2,
      stepIndex: 2,
      stepType: 'tool',
      toolName: 'read_file',
    });
  });

  it('should score similarity accurately between tool steps', () => {
    const stepA = {
      turnNumber: 1,
      stepIndex: 0,
      stepType: 'tool' as const,
      toolName: 'bash',
      arguments: { cmd: 'npm test' },
      result: { success: true },
    };

    const stepBIdentical = {
      turnNumber: 1,
      stepIndex: 0,
      stepType: 'tool' as const,
      toolName: 'bash',
      arguments: { cmd: 'npm test' },
      result: { success: true },
    };

    const stepCDiffArgs = {
      turnNumber: 1,
      stepIndex: 0,
      stepType: 'tool' as const,
      toolName: 'bash',
      arguments: { cmd: 'pnpm test --bail' },
      result: { success: true },
    };

    const stepDDiffTool = {
      turnNumber: 1,
      stepIndex: 0,
      stepType: 'tool' as const,
      toolName: 'read_file',
      arguments: { path: 'package.json' },
      result: { success: true },
    };

    expect(calculateStepSimilarity(stepA, stepBIdentical)).toBe(1.0);
    expect(calculateStepSimilarity(stepA, stepCDiffArgs)).toBeGreaterThan(0.5);
    expect(calculateStepSimilarity(stepA, stepCDiffArgs)).toBeLessThan(1.0);
    expect(calculateStepSimilarity(stepA, stepDDiffTool)).toBe(0.0);
  });

  it('should align identical trajectories with 100% matches', () => {
    const steps = [
      {
        turnNumber: 1,
        stepIndex: 0,
        stepType: 'tool' as const,
        toolName: 'bash',
        arguments: { command: 'ls -la' },
        result: { success: true },
      },
      {
        turnNumber: 1,
        stepIndex: 1,
        stepType: 'turn_end' as const,
        assistantMessage: 'Directory listed',
      },
    ];

    const aligned = alignTrajectorySteps(steps, steps);
    expect(aligned).toHaveLength(2);
    expect(aligned.every((s) => s.alignmentType === 'match')).toBe(true);
    expect(aligned[0].similarity).toBe(1.0);
    expect(aligned[1].similarity).toBe(1.0);
  });

  it('should detect added, removed, and modified steps in alignment', () => {
    const baseline = [
      {
        turnNumber: 1,
        stepIndex: 0,
        stepType: 'tool' as const,
        toolName: 'bash',
        arguments: { cmd: 'build' },
        result: { success: true },
      },
      {
        turnNumber: 2,
        stepIndex: 1,
        stepType: 'tool' as const,
        toolName: 'bash',
        arguments: { cmd: 'test' },
        result: { success: true },
      },
    ];

    const candidate = [
      {
        turnNumber: 1,
        stepIndex: 0,
        stepType: 'tool' as const,
        toolName: 'bash',
        arguments: { cmd: 'install' }, // added exploratory step
        result: { success: true },
      },
      {
        turnNumber: 2,
        stepIndex: 1,
        stepType: 'tool' as const,
        toolName: 'bash',
        arguments: { cmd: 'build' }, // matches baseline 0
        result: { success: true },
      },
      {
        turnNumber: 3,
        stepIndex: 2,
        stepType: 'tool' as const,
        toolName: 'bash',
        arguments: { cmd: 'test --coverage' }, // modified from baseline 1
        result: { success: false, error: 'fail' },
      },
    ];

    const aligned = alignTrajectorySteps(baseline, candidate);
    expect(aligned.length).toBeGreaterThanOrEqual(3);

    const hasAdded = aligned.some((s) => s.alignmentType === 'added');
    const hasMatch = aligned.some((s) => s.alignmentType === 'match');
    const hasModified = aligned.some((s) => s.alignmentType === 'modified');

    expect(hasAdded).toBe(true);
    expect(hasMatch).toBe(true);
    expect(hasModified).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { PolicyDistiller } from '../../src/distillation/distiller.js';
import type { ClusterConsensusResult, CanonicalTrajectory } from '../../src/consensus/types.js';
import type { Trajectory } from '../../src/core/types.js';

describe('PolicyDistiller', () => {
  const mockCanonical: CanonicalTrajectory = {
    scenarioId: 'fix-bug-42',
    description: 'Fix indexing bug in parser',
    confidenceScore: 92.5,
    synthesizedFromCount: 5,
    prunedOutlierStepsCount: 2,
    totalSteps: 3,
    turns: [
      {
        turnNumber: 1,
        instruction: 'Investigate and resolve parser off-by-one bug',
        thought: 'Inspect test files and repository structure',
        toolCalls: [
          {
            toolName: 'read_file',
            arguments: { path: 'src/parser.ts' },
            result: { success: true, output: 'function parse() { ... }' },
            durationMs: 15,
          },
        ],
      },
      {
        turnNumber: 2,
        instruction: 'Investigate and resolve parser off-by-one bug',
        thought: 'Apply patch to parser index boundary',
        toolCalls: [
          {
            toolName: 'edit_file',
            arguments: { path: 'src/parser.ts', search: 'i <= len', replace: 'i < len' },
            result: { success: true, output: 'Successfully replaced content' },
            durationMs: 30,
          },
        ],
      },
      {
        turnNumber: 3,
        instruction: 'Investigate and resolve parser off-by-one bug',
        thought: 'Run test suite to verify fix',
        toolCalls: [
          {
            toolName: 'run_tests',
            arguments: { command: 'npm test' },
            result: { success: true, output: 'All tests passed' },
            durationMs: 250,
          },
        ],
        assistantMessage: 'Bug successfully resolved and verified.',
      },
    ],
  };

  const mockConsensus: ClusterConsensusResult = {
    scenarioId: 'fix-bug-42',
    metrics: {
      totalTrajectories: 5,
      successfulTrajectories: 4,
      failedTrajectories: 1,
      successRate: 0.8,
      averageTurns: 3.2,
      averageTokens: 1200,
      averageDurationMs: 3500,
      overallAgreementScore: 88,
      pathDiversityEntropy: 1.15,
      alignmentColumnsCount: 3,
      invariantStepsCount: 2,
      majorityStepsCount: 1,
      minorityStepsCount: 0,
      outlierStepsCount: 1,
    },
    alignmentColumns: [],
    bottlenecks: [
      {
        columnIndex: 0,
        step: {
          turnNumber: 1,
          stepIndex: 0,
          stepType: 'tool',
          toolName: 'read_file',
          arguments: { path: 'src/parser.ts' },
        },
        frequency: 1.0,
        successCorrelation: 0.95,
        description: 'Read the parser implementation file',
      },
      {
        columnIndex: 1,
        step: {
          turnNumber: 2,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'edit_file',
          arguments: { path: 'src/parser.ts' },
        },
        frequency: 0.9,
        successCorrelation: 0.88,
        description: 'Apply the bug fix to parser',
      },
    ],
    deadEnds: [
      {
        columnIndex: 2,
        step: {
          turnNumber: 2,
          stepIndex: 2,
          stepType: 'tool',
          toolName: 'bash',
          arguments: { command: 'rm -rf node_modules && npm i' },
        },
        failureRate: 1.0,
        affectedTrajectories: ['run-failed-1'],
        errorDetails: ['npm ERR! network timeout', 'Permission denied'],
      },
    ],
    canonicalTrajectory: mockCanonical,
    trajectories: [],
  };

  it('distills policy successfully from ClusterConsensusResult', () => {
    const distiller = new PolicyDistiller();
    const policy = distiller.distillFromConsensus(mockConsensus);

    expect(policy.metadata.scenarioId).toBe('fix-bug-42');
    expect(policy.metadata.source).toBe('consensus_cluster');
    expect(policy.metadata.confidenceScore).toBe(92.5);
    expect(policy.metadata.sourceTrajectoriesCount).toBe(5);

    // Milestones extracted from bottlenecks
    expect(policy.milestones.length).toBe(2);
    expect(policy.milestones[0].targetTool).toBe('read_file');
    expect(policy.milestones[0].importance).toBe('critical');
    expect(policy.milestones[1].targetTool).toBe('edit_file');

    // Anti-patterns extracted from deadEnds
    expect(policy.antiPatterns.length).toBe(1);
    expect(policy.antiPatterns[0].triggerTool).toBe('bash');
    expect(policy.antiPatterns[0].severity).toBe('critical');
    expect(policy.antiPatterns[0].errorKeywords).toContain('npm ERR! network timeout');

    // Steering rules generated
    expect(policy.steeringRules.length).toBeGreaterThan(0);
    expect(policy.steeringRules.some((r) => r.breakpoint.toolPattern === 'bash')).toBe(true);

    // Few-shot exemplar
    expect(policy.fewShotExemplar).toBeDefined();
    expect(policy.fewShotExemplar?.turns.length).toBe(3);
  });

  it('distills policy directly from CanonicalTrajectory', () => {
    const distiller = new PolicyDistiller();
    const policy = distiller.distillFromCanonical(mockCanonical);

    expect(policy.metadata.scenarioId).toBe('fix-bug-42');
    expect(policy.metadata.source).toBe('canonical_trajectory');
    expect(policy.milestones.length).toBe(3);
    expect(policy.milestones[0].targetTool).toBe('read_file');
    expect(policy.milestones[1].targetTool).toBe('edit_file');
    expect(policy.milestones[2].targetTool).toBe('run_tests');
  });

  it('distills policy from a single raw Trajectory', () => {
    const rawTrajectory: Trajectory = {
      scenarioId: 'raw-task-1',
      startedAt: new Date().toISOString(),
      durationMs: 4000,
      status: 'completed',
      turns: [
        {
          turnNumber: 1,
          prompt: 'Solve raw task',
          thought: 'Check workspace',
          toolCalls: [
            {
              callId: 'c1',
              toolName: 'list_dir',
              arguments: { path: '.' },
              result: { success: true, output: 'file1.txt, file2.txt' },
            },
          ],
          tokensUsed: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        },
        {
          turnNumber: 2,
          prompt: 'Solve raw task',
          thought: 'Bad command attempt',
          toolCalls: [
            {
              callId: 'c2',
              toolName: 'invalid_tool',
              arguments: { foo: 'bar' },
              result: { success: false, error: 'Command not recognized' },
            },
          ],
          tokensUsed: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        },
        {
          turnNumber: 3,
          prompt: 'Solve raw task',
          thought: 'Read file',
          toolCalls: [
            {
              callId: 'c3',
              toolName: 'read_file',
              arguments: { path: 'file1.txt' },
              result: { success: true, output: 'contents' },
            },
          ],
          tokensUsed: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        },
      ],
      summary: {
        totalTurns: 3,
        totalToolCalls: 3,
        totalTokens: 90,
        costUsd: 0.001,
        completed: true,
      },
    };

    const distiller = new PolicyDistiller();
    const policy = distiller.distillFromTrajectory(rawTrajectory);

    expect(policy.metadata.scenarioId).toBe('raw-task-1');
    expect(policy.metadata.source).toBe('raw_trajectory');
    // Only successful calls become positive milestones
    expect(policy.milestones.some((m) => m.targetTool === 'list_dir')).toBe(true);
    expect(policy.milestones.some((m) => m.targetTool === 'read_file')).toBe(true);
    expect(policy.milestones.some((m) => m.targetTool === 'invalid_tool')).toBe(false);

    // Failing tool call becomes an anti-pattern
    expect(policy.antiPatterns.some((ap) => ap.triggerTool === 'invalid_tool')).toBe(true);
  });

  it('compresses redundant repetitive steps and enforces token budget', () => {
    const distiller = new PolicyDistiller();
    const bloatedCanonical: CanonicalTrajectory = {
      scenarioId: 'bloated-task',
      confidenceScore: 70,
      synthesizedFromCount: 3,
      prunedOutlierStepsCount: 0,
      totalSteps: 10,
      turns: Array.from({ length: 8 }, (_, i) => ({
        turnNumber: i + 1,
        instruction: 'Perform task with many steps',
        thought: `Step ${i + 1} thought with excessive repetitive details`,
        toolCalls: [
          {
            toolName: i < 3 ? 'list_dir' : 'read_file',
            arguments: i < 3 ? { path: '.' } : { path: `file_${i}.txt` },
            result: { success: true, output: 'Long log output '.repeat(50) },
          },
        ],
      })),
    };

    // Low token budget forces pruning
    const policy = distiller.distillFromCanonical(bloatedCanonical, {
      tokenBudget: 150,
      compressRedundantSteps: true,
    });

    expect(policy.fewShotExemplar).toBeDefined();
    // Pruned flag should be set
    expect(policy.fewShotExemplar?.isPruned).toBe(true);
    // Estimated tokens should be within budget
    expect(policy.fewShotExemplar?.tokenEstimate).toBeLessThanOrEqual(250);
  });
});

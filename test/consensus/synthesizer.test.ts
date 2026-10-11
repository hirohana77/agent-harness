import { describe, expect, it } from 'vitest';
import { CanonicalTrajectorySynthesizer } from '../../src/consensus/synthesizer.js';
import { AlignedConsensusColumn, ConsensusOptions } from '../../src/consensus/types.js';

describe('CanonicalTrajectorySynthesizer', () => {
  const options: ConsensusOptions = {
    similarityThreshold: 0.6,
    strictArgs: false,
    bottleneckThreshold: 0.8,
    deadEndThreshold: 0.6,
    gapPenalty: -0.5,
    minAgreementRate: 0.5,
  };

  it('should synthesize empty canonical trajectory when no columns provided', () => {
    const canonical = CanonicalTrajectorySynthesizer.synthesize('task-1', [], options);
    expect(canonical.scenarioId).toBe('task-1');
    expect(canonical.turns).toHaveLength(0);
    expect(canonical.confidenceScore).toBe(0);
  });

  it('should filter out outlier steps and retain high agreement consensus steps', () => {
    const mockColumns: AlignedConsensusColumn[] = [
      {
        columnIndex: 0,
        slots: [],
        consensusStep: {
          turnNumber: 1,
          stepIndex: 0,
          stepType: 'tool',
          toolName: 'git_checkout',
          arguments: { branch: 'fix' },
        },
        agreementRate: 1.0,
        level: 'invariant',
        dominantToolName: 'git_checkout',
        isBottleneck: true,
        isTrap: false,
        activeCount: 3,
        totalCount: 3,
      },
      {
        columnIndex: 1,
        slots: [],
        consensusStep: {
          turnNumber: 1,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'hallucinated_probe',
          arguments: { test: true },
        },
        agreementRate: 0.33,
        level: 'outlier',
        dominantToolName: 'hallucinated_probe',
        isBottleneck: false,
        isTrap: false,
        activeCount: 1,
        totalCount: 3,
      },
      {
        columnIndex: 2,
        slots: [],
        consensusStep: {
          turnNumber: 2,
          stepIndex: 2,
          stepType: 'tool',
          toolName: 'npm_test',
          arguments: { suite: 'unit' },
        },
        agreementRate: 1.0,
        level: 'invariant',
        dominantToolName: 'npm_test',
        isBottleneck: true,
        isTrap: false,
        activeCount: 3,
        totalCount: 3,
      },
      {
        columnIndex: 3,
        slots: [],
        consensusStep: {
          turnNumber: 2,
          stepIndex: 3,
          stepType: 'turn_end',
          assistantMessage: 'Tests passed, task solved',
        },
        agreementRate: 1.0,
        level: 'invariant',
        isBottleneck: false,
        isTrap: false,
        activeCount: 3,
        totalCount: 3,
      },
    ];

    const canonical = CanonicalTrajectorySynthesizer.synthesize('bug-fix-scenario', mockColumns, options);

    expect(canonical.scenarioId).toBe('bug-fix-scenario');
    expect(canonical.synthesizedFromCount).toBe(3);
    expect(canonical.prunedOutlierStepsCount).toBe(1); // hallucinated_probe pruned
    expect(canonical.confidenceScore).toBe(100);
    expect(canonical.turns.length).toBeGreaterThan(0);

    const toolsUsed = canonical.turns.flatMap((t) => t.toolCalls?.map((c) => c.toolName) || []);
    expect(toolsUsed).toContain('git_checkout');
    expect(toolsUsed).toContain('npm_test');
    expect(toolsUsed).not.toContain('hallucinated_probe');
  });

  it('should deduplicate consecutive redundant tool calls in consensus', () => {
    const mockColumns: AlignedConsensusColumn[] = [
      {
        columnIndex: 0,
        slots: [],
        consensusStep: {
          turnNumber: 1,
          stepIndex: 0,
          stepType: 'tool',
          toolName: 'ls',
          arguments: { path: '.' },
        },
        agreementRate: 1.0,
        level: 'invariant',
        dominantToolName: 'ls',
        isBottleneck: false,
        isTrap: false,
        activeCount: 2,
        totalCount: 2,
      },
      {
        columnIndex: 1,
        slots: [],
        consensusStep: {
          turnNumber: 1,
          stepIndex: 1,
          stepType: 'tool',
          toolName: 'ls',
          arguments: { path: '.' },
        },
        agreementRate: 1.0,
        level: 'invariant',
        dominantToolName: 'ls',
        isBottleneck: false,
        isTrap: false,
        activeCount: 2,
        totalCount: 2,
      },
      {
        columnIndex: 2,
        slots: [],
        consensusStep: {
          turnNumber: 2,
          stepIndex: 2,
          stepType: 'turn_end',
          assistantMessage: 'Done',
        },
        agreementRate: 1.0,
        level: 'invariant',
        isBottleneck: false,
        isTrap: false,
        activeCount: 2,
        totalCount: 2,
      },
    ];

    const canonical = CanonicalTrajectorySynthesizer.synthesize('dedup-task', mockColumns, options);
    const toolsUsed = canonical.turns.flatMap((t) => t.toolCalls?.map((c) => c.toolName) || []);
    expect(toolsUsed.filter((t) => t === 'ls')).toHaveLength(1);
    expect(canonical.prunedOutlierStepsCount).toBe(1);
  });
});

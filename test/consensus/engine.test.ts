import { describe, expect, it } from 'vitest';
import { ClusterConsensusEngine } from '../../src/consensus/engine.js';
import { ClusterConsensusResultSchema } from '../../src/consensus/schemas.js';
import { Trajectory } from '../../src/core/types.js';

describe('ClusterConsensusEngine End-to-End', () => {
  const createMockTrajectory = (
    id: string,
    steps: Array<{ tool: string; cmd: string; success?: boolean; error?: string }>,
    status: 'completed' | 'error' = 'completed'
  ): Trajectory => ({
    scenarioId: 'multi-run-scenario',
    startedAt: new Date().toISOString(),
    durationMs: 1500,
    status,
    turns: steps.map((s, idx) => ({
      turnNumber: idx + 1,
      prompt: `Execute step ${idx + 1}`,
      thought: `Agent thought about ${s.tool}`,
      toolCalls: [
        {
          callId: `call-${idx}`,
          toolName: s.tool,
          arguments: { command: s.cmd },
          result: {
            success: s.success ?? (status === 'completed'),
            output: s.success ? 'Command executed successfully' : undefined,
            error: s.error,
          },
          durationMs: 45,
        },
      ],
      assistantMessage: `Turn ${idx + 1} finished`,
      tokensUsed: { promptTokens: 60, completionTokens: 40, totalTokens: 100 },
    })),
    summary: {
      totalTurns: steps.length,
      totalToolCalls: steps.length,
      totalTokens: steps.length * 100,
      costUsd: 0.003,
      completed: status === 'completed',
    },
  });

  it('should throw an error if empty trajectory list is passed', () => {
    const engine = new ClusterConsensusEngine();
    expect(() => engine.analyze([])).toThrow(
      'ClusterConsensusEngine requires at least one trajectory to analyze.'
    );
  });

  it('should analyze multiple rollouts and produce validated ClusterConsensusResult', () => {
    // 3 trajectories with high consensus
    const traj1 = createMockTrajectory('run-1', [
      { tool: 'git_status', cmd: 'status' },
      { tool: 'pytest', cmd: 'test_calc.py' },
    ]);
    const traj2 = createMockTrajectory('run-2', [
      { tool: 'git_status', cmd: 'status' },
      { tool: 'pytest', cmd: 'test_calc.py' },
    ]);
    const traj3 = createMockTrajectory('run-3', [
      { tool: 'git_status', cmd: 'status' },
      { tool: 'pytest', cmd: 'test_calc.py' },
    ]);

    const result = ClusterConsensusEngine.analyzeCluster([traj1, traj2, traj3]);

    // Validate result against Zod schema
    const parsed = ClusterConsensusResultSchema.parse(result);
    expect(parsed.scenarioId).toBe('multi-run-scenario');
    expect(parsed.metrics.totalTrajectories).toBe(3);
    expect(parsed.metrics.successfulTrajectories).toBe(3);
    expect(parsed.metrics.successRate).toBe(1.0);
    expect(parsed.metrics.overallAgreementScore).toBeGreaterThanOrEqual(95);

    // Canonical trajectory must contain consensus steps
    expect(parsed.canonicalTrajectory.scenarioId).toBe('multi-run-scenario');
    expect(parsed.canonicalTrajectory.confidenceScore).toBeGreaterThan(90);
    expect(parsed.canonicalTrajectory.turns.length).toBeGreaterThan(0);
  });

  it('should accurately isolate dead-end trap in a diverging failing run', () => {
    const success1 = createMockTrajectory('s1', [
      { tool: 'find_files', cmd: 'src/' },
      { tool: 'edit_code', cmd: 'patch.diff' },
      { tool: 'run_tests', cmd: 'npm test' },
    ], 'completed');

    const success2 = createMockTrajectory('s2', [
      { tool: 'find_files', cmd: 'src/' },
      { tool: 'edit_code', cmd: 'patch.diff' },
      { tool: 'run_tests', cmd: 'npm test' },
    ], 'completed');

    const failedRun = createMockTrajectory('f1', [
      { tool: 'find_files', cmd: 'src/' },
      { tool: 'forbidden_rm', cmd: 'rm -rf *', success: false, error: 'Command blocked by policy' },
    ], 'error');

    const result = ClusterConsensusEngine.analyzeCluster([success1, success2, failedRun]);

    expect(result.metrics.totalTrajectories).toBe(3);
    expect(result.metrics.successfulTrajectories).toBe(2);
    expect(result.metrics.failedTrajectories).toBe(1);
    expect(result.metrics.successRate).toBe(0.67);

    // Dead-end trap found
    expect(result.deadEnds.length).toBeGreaterThan(0);
    const trap = result.deadEnds.find((d) => d.step.toolName === 'forbidden_rm');
    expect(trap).toBeDefined();
    expect(trap?.affectedTrajectories).toContain('multi-run-scenario-3');
    expect(trap?.errorDetails).toContain('Command blocked by policy');

    // Canonical trajectory pruned the failing step
    const canonicalTools = result.canonicalTrajectory.turns.flatMap(
      (t) => t.toolCalls?.map((tc) => tc.toolName) || []
    );
    expect(canonicalTools).not.toContain('forbidden_rm');
    expect(canonicalTools).toContain('find_files');
  });
});

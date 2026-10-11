import { Trajectory } from '../core/types.js';
import {
  AlignedConsensusColumn,
  BottleneckNode,
  ConsensusOptions,
  DeadEndTrap,
  TrajectoryClusterMetrics,
  TrajectoryRunMetadata,
} from './types.js';

export class ConsensusAnalyzer {
  /**
   * Analyzes aligned columns and trajectory metadata to produce metrics, bottlenecks, and dead-ends.
   */
  public static analyze(
    columns: AlignedConsensusColumn[],
    trajectories: Trajectory[],
    options: ConsensusOptions
  ): {
    metrics: TrajectoryClusterMetrics;
    bottlenecks: BottleneckNode[];
    deadEnds: DeadEndTrap[];
    trajectoryMetadata: TrajectoryRunMetadata[];
  } {
    const totalTrajectories = trajectories.length;

    // Build metadata map
    const trajectoryMetadata: TrajectoryRunMetadata[] = trajectories.map((traj, idx) => {
      const id = traj.scenarioId ? `${traj.scenarioId}-${idx + 1}` : `run-${idx + 1}`;
      const status = traj.status || 'completed';
      const turnsCount = traj.turns.length;
      let tokens = traj.summary?.totalTokens ?? 0;
      let durationMs = traj.durationMs ?? 0;

      if (tokens === 0) {
        for (const turn of traj.turns) {
          if (turn.tokensUsed?.totalTokens) {
            tokens += turn.tokensUsed.totalTokens;
          }
        }
      }

      if (durationMs === 0) {
        for (const turn of traj.turns) {
          if (turn.toolCalls) {
            for (const tc of turn.toolCalls) {
              durationMs += tc.durationMs || 0;
            }
          }
        }
      }

      return {
        id,
        status,
        turnsCount,
        tokens,
        durationMs,
      };
    });

    const successfulRuns = new Set(
      trajectoryMetadata
        .filter((t) => t.status === 'completed')
        .map((t) => t.id)
    );
    const failedRuns = new Set(
      trajectoryMetadata
        .filter((t) => !successfulRuns.has(t.id))
        .map((t) => t.id)
    );

    const successfulCount = successfulRuns.size;
    const failedCount = failedRuns.size;
    const successRate = totalTrajectories > 0 ? successfulCount / totalTrajectories : 0;

    const avgTurns =
      totalTrajectories > 0
        ? trajectoryMetadata.reduce((sum, t) => sum + t.turnsCount, 0) / totalTrajectories
        : 0;
    const avgTokens =
      totalTrajectories > 0
        ? trajectoryMetadata.reduce((sum, t) => sum + t.tokens, 0) / totalTrajectories
        : 0;
    const avgDuration =
      totalTrajectories > 0
        ? trajectoryMetadata.reduce((sum, t) => sum + t.durationMs, 0) / totalTrajectories
        : 0;

    // Agreement and column statistics
    let invariantCount = 0;
    let majorityCount = 0;
    let minorityCount = 0;
    let outlierCount = 0;
    let totalAgreementSum = 0;

    for (const col of columns) {
      if (col.level === 'invariant') invariantCount++;
      else if (col.level === 'majority') majorityCount++;
      else if (col.level === 'minority') minorityCount++;
      else if (col.level === 'outlier') outlierCount++;

      totalAgreementSum += col.agreementRate;
    }

    const overallAgreementScore =
      columns.length > 0 ? Math.round((totalAgreementSum / columns.length) * 1000) / 10 : 100;

    // Shannon Entropy of step patterns
    const pathDiversityEntropy = this.computePathDiversityEntropy(columns, totalTrajectories);

    // Identify Bottlenecks & Dead-end Traps
    const bottlenecks: BottleneckNode[] = [];
    const deadEnds: DeadEndTrap[] = [];

    const bottleneckThresh = options.bottleneckThreshold ?? 0.8;
    const deadEndThresh = options.deadEndThreshold ?? 0.6;

    for (const col of columns) {
      if (!col.consensusStep) continue;

      const activeSlotRuns = col.slots.filter((s) => !s.gap).map((s) => s.trajectoryId);
      const activeSuccessRuns = activeSlotRuns.filter((id) => successfulRuns.has(id));
      const activeFailRuns = activeSlotRuns.filter((id) => failedRuns.has(id));

      const successCoverage =
        successfulCount > 0 ? activeSuccessRuns.length / successfulCount : 0;

      // Bottleneck detection: high representation among successful trajectories
      if (successCoverage >= bottleneckThresh && col.agreementRate >= (options.minAgreementRate ?? 0.5)) {
        col.isBottleneck = true;
        const nonActiveSuccessRuns = successfulCount - activeSuccessRuns.length;
        const pSuccessWithStep =
          activeSlotRuns.length > 0 ? activeSuccessRuns.length / activeSlotRuns.length : 0;
        const inactiveCount = totalTrajectories - activeSlotRuns.length;
        const pSuccessWithoutStep =
          inactiveCount > 0 ? nonActiveSuccessRuns / inactiveCount : 0;
        const correlation = Math.round((pSuccessWithStep - pSuccessWithoutStep) * 100) / 100;

        bottlenecks.push({
          columnIndex: col.columnIndex,
          step: col.consensusStep,
          frequency: Math.round(col.agreementRate * 100) / 100,
          successCorrelation: correlation,
          description: `Key checkpoint step '${col.consensusStep.toolName || col.consensusStep.stepType}' passed by ${activeSuccessRuns.length}/${successfulCount} successful runs`,
        });
      }

      // Dead-end trap detection: high failure rate among runs that executed this step
      if (activeSlotRuns.length > 0) {
        const failureRate = activeFailRuns.length / activeSlotRuns.length;
        if (failureRate >= deadEndThresh && activeFailRuns.length >= 1) {
          col.isTrap = true;
          const errors: string[] = [];
          for (const slot of col.slots) {
            if (!slot.gap && slot.step?.result?.error) {
              errors.push(String(slot.step.result.error));
            }
          }

          deadEnds.push({
            columnIndex: col.columnIndex,
            step: col.consensusStep,
            failureRate: Math.round(failureRate * 100) / 100,
            affectedTrajectories: activeFailRuns,
            errorDetails: Array.from(new Set(errors)).slice(0, 5),
          });
        }
      }
    }

    const metrics: TrajectoryClusterMetrics = {
      totalTrajectories,
      successfulTrajectories: successfulCount,
      failedTrajectories: failedCount,
      successRate: Math.round(successRate * 100) / 100,
      averageTurns: Math.round(avgTurns * 10) / 10,
      averageTokens: Math.round(avgTokens),
      averageDurationMs: Math.round(avgDuration),
      overallAgreementScore,
      pathDiversityEntropy: Math.round(pathDiversityEntropy * 100) / 100,
      alignmentColumnsCount: columns.length,
      invariantStepsCount: invariantCount,
      majorityStepsCount: majorityCount,
      minorityStepsCount: minorityCount,
      outlierStepsCount: outlierCount,
    };

    return {
      metrics,
      bottlenecks,
      deadEnds,
      trajectoryMetadata,
    };
  }

  /**
   * Calculates Shannon Entropy H = - sum(p_i * log2(p_i)) across column decision distributions.
   */
  private static computePathDiversityEntropy(
    columns: AlignedConsensusColumn[],
    totalTrajectories: number
  ): number {
    if (columns.length === 0 || totalTrajectories <= 1) {
      return 0.0;
    }

    let totalEntropy = 0;
    for (const col of columns) {
      const activeCount = col.activeCount;
      const gapCount = totalTrajectories - activeCount;

      const pActive = activeCount / totalTrajectories;
      const pGap = gapCount / totalTrajectories;

      let colEntropy = 0;
      if (pActive > 0) colEntropy -= pActive * Math.log2(pActive);
      if (pGap > 0) colEntropy -= pGap * Math.log2(pGap);

      totalEntropy += colEntropy;
    }

    return totalEntropy / columns.length;
  }
}

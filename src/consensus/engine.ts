import { Trajectory } from '../core/types.js';
import {
  ClusterConsensusResult,
  ConsensusOptions,
} from './types.js';
import {
  ConsensusOptionsSchema,
  ClusterConsensusResultSchema,
} from './schemas.js';
import { alignMultipleTrajectories } from './msa.js';
import { ConsensusAnalyzer } from './analyzer.js';
import { CanonicalTrajectorySynthesizer } from './synthesizer.js';

export class ClusterConsensusEngine {
  private options: ConsensusOptions;

  constructor(options: Partial<ConsensusOptions> = {}) {
    this.options = ConsensusOptionsSchema.parse(options);
  }

  /**
   * Analyzes an ensemble of N trajectories for a given task/scenario.
   * Produces multi-sequence alignment, consensus metrics, bottlenecks, dead-ends,
   * and distills the canonical golden trajectory.
   */
  public analyze(
    trajectories: Trajectory[],
    customOptions?: Partial<ConsensusOptions>
  ): ClusterConsensusResult {
    if (!trajectories || trajectories.length === 0) {
      throw new Error('ClusterConsensusEngine requires at least one trajectory to analyze.');
    }

    const mergedOptions: ConsensusOptions = customOptions
      ? ConsensusOptionsSchema.parse({ ...this.options, ...customOptions })
      : this.options;

    const scenarioId = trajectories[0].scenarioId || 'unknown-scenario';

    // 1. Perform Multi-Sequence Alignment
    const alignmentColumns = alignMultipleTrajectories(trajectories, mergedOptions);

    // 2. Perform Consensus Analysis (Bottlenecks, Traps, Entropy, Metrics)
    const { metrics, bottlenecks, deadEnds, trajectoryMetadata } =
      ConsensusAnalyzer.analyze(alignmentColumns, trajectories, mergedOptions);

    // 3. Synthesize Canonical Golden Trajectory
    const canonicalTrajectory = CanonicalTrajectorySynthesizer.synthesize(
      scenarioId,
      alignmentColumns,
      mergedOptions
    );

    const result: ClusterConsensusResult = {
      scenarioId,
      metrics,
      alignmentColumns,
      bottlenecks,
      deadEnds,
      canonicalTrajectory,
      trajectories: trajectoryMetadata,
    };

    // Validate against schema to ensure strict type safety
    return ClusterConsensusResultSchema.parse(result);
  }

  /**
   * Static helper for one-shot cluster analysis.
   */
  public static analyzeCluster(
    trajectories: Trajectory[],
    options?: Partial<ConsensusOptions>
  ): ClusterConsensusResult {
    const engine = new ClusterConsensusEngine(options);
    return engine.analyze(trajectories);
  }
}

import { z } from 'zod';
import {
  ConsensusStepLevelSchema,
  ConsensusSlotSchema,
  AlignedConsensusColumnSchema,
  TrajectoryClusterMetricsSchema,
  BottleneckNodeSchema,
  DeadEndTrapSchema,
  CanonicalTrajectoryTurnSchema,
  CanonicalTrajectorySchema,
  TrajectoryRunMetadataSchema,
  ClusterConsensusResultSchema,
  ConsensusOptionsSchema,
} from './schemas.js';

export type ConsensusStepLevel = z.infer<typeof ConsensusStepLevelSchema>;
export type ConsensusSlot = z.infer<typeof ConsensusSlotSchema>;
export type AlignedConsensusColumn = z.infer<typeof AlignedConsensusColumnSchema>;
export type TrajectoryClusterMetrics = z.infer<typeof TrajectoryClusterMetricsSchema>;
export type BottleneckNode = z.infer<typeof BottleneckNodeSchema>;
export type DeadEndTrap = z.infer<typeof DeadEndTrapSchema>;
export type CanonicalTrajectoryTurn = z.infer<typeof CanonicalTrajectoryTurnSchema>;
export type CanonicalTrajectory = z.infer<typeof CanonicalTrajectorySchema>;
export type TrajectoryRunMetadata = z.infer<typeof TrajectoryRunMetadataSchema>;
export type ClusterConsensusResult = z.infer<typeof ClusterConsensusResultSchema>;
export type ConsensusOptions = z.infer<typeof ConsensusOptionsSchema>;

export type ConsensusReportFormat = 'terminal' | 'markdown' | 'json';

import { Trajectory } from '../core/types.js';
import { extractTrajectorySteps, calculateStepSimilarity } from '../comparator/alignment.js';
import { TrajectoryStepSummary } from '../comparator/types.js';
import {
  AlignedConsensusColumn,
  ConsensusOptions,
  ConsensusSlot,
  ConsensusStepLevel,
} from './types.js';

export interface TrajectorySequence {
  id: string;
  steps: TrajectoryStepSummary[];
}

interface ProfileSlot {
  trajectoryId: string;
  stepIndex?: number;
  step?: TrajectoryStepSummary;
  gap: boolean;
}

type Profile = ProfileSlot[][]; // columns: ProfileSlot[] where each element is an array of slots for each trajectory

/**
 * Computes pairwise alignment similarity between two sequences of steps.
 */
function computePairwiseScore(
  seqA: TrajectoryStepSummary[],
  seqB: TrajectoryStepSummary[],
  strictArgs: boolean
): number {
  if (seqA.length === 0 && seqB.length === 0) return 1.0;
  if (seqA.length === 0 || seqB.length === 0) return 0.0;

  let totalSim = 0;
  let matches = 0;
  const lenB = seqB.length;
  for (let i = 0; i < seqA.length; i++) {
    let best = 0;
    // Window search around i
    const start = Math.max(0, i - 3);
    const end = Math.min(lenB, i + 4);
    for (let j = start; j < end; j++) {
      const sim = calculateStepSimilarity(seqA[i], seqB[j], strictArgs);
      if (sim > best) best = sim;
    }
    if (best > 0) {
      totalSim += best;
      matches++;
    }
  }

  return matches > 0 ? totalSim / Math.max(seqA.length, seqB.length) : 0;
}

/**
 * Align a single sequence into an existing multi-sequence profile.
 */
function alignSequenceToProfile(
  profile: Profile,
  seq: TrajectorySequence,
  options: ConsensusOptions
): Profile {
  const numProfileCols = profile.length;
  const numSeqSteps = seq.steps.length;

  if (numProfileCols === 0 && numSeqSteps === 0) {
    return [];
  }

  if (numProfileCols === 0) {
    return seq.steps.map((st) => [
      {
        trajectoryId: seq.id,
        stepIndex: st.stepIndex,
        step: st,
        gap: false,
      },
    ]);
  }

  if (numSeqSteps === 0) {
    return profile.map((col) => [
      ...col,
      {
        trajectoryId: seq.id,
        gap: true,
      },
    ]);
  }

  const GAP_PENALTY = options.gapPenalty ?? -0.5;
  const MISMATCH_PENALTY = -2.5;

  // DP table for aligning profile cols (0..numProfileCols) and seq steps (0..numSeqSteps)
  const dp: number[][] = Array.from({ length: numProfileCols + 1 }, () =>
    new Array(numSeqSteps + 1).fill(0)
  );

  for (let i = 0; i <= numProfileCols; i++) dp[i][0] = i * GAP_PENALTY;
  for (let j = 0; j <= numSeqSteps; j++) dp[0][j] = j * GAP_PENALTY;

  // Precalculate column-to-step similarity
  const simMatrix: number[][] = Array.from({ length: numProfileCols }, () =>
    new Array(numSeqSteps).fill(0)
  );

  for (let i = 0; i < numProfileCols; i++) {
    const col = profile[i];
    const nonGapSteps = col.filter((s) => !s.gap && s.step).map((s) => s.step!);
    for (let j = 0; j < numSeqSteps; j++) {
      if (nonGapSteps.length === 0) {
        simMatrix[i][j] = 0;
      } else {
        const avgSim =
          nonGapSteps.reduce(
            (sum, pStep) => sum + calculateStepSimilarity(pStep, seq.steps[j], options.strictArgs),
            0
          ) / nonGapSteps.length;
        simMatrix[i][j] = avgSim;
      }
    }
  }

  for (let i = 1; i <= numProfileCols; i++) {
    for (let j = 1; j <= numSeqSteps; j++) {
      const sim = simMatrix[i - 1][j - 1];
      const matchScore = sim >= options.similarityThreshold ? sim * 2.0 : MISMATCH_PENALTY;
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + matchScore,
        dp[i - 1][j] + GAP_PENALTY,
        dp[i][j - 1] + GAP_PENALTY
      );
    }
  }

  // Backtracking to form new profile
  const newProfile: Profile = [];
  let i = numProfileCols;
  let j = numSeqSteps;

  const numExistingSeqs = profile[0].length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = simMatrix[i - 1][j - 1];
      const matchScore = sim >= options.similarityThreshold ? sim * 2.0 : MISMATCH_PENALTY;
      if (
        sim >= options.similarityThreshold &&
        Math.abs(dp[i][j] - (dp[i - 1][j - 1] + matchScore)) < 1e-6
      ) {
        const existingCol = profile[i - 1];
        const step = seq.steps[j - 1];
        newProfile.unshift([
          ...existingCol,
          {
            trajectoryId: seq.id,
            stepIndex: step.stepIndex,
            step,
            gap: false,
          },
        ]);
        i--;
        j--;
        continue;
      }
    }

    if (i > 0 && (j === 0 || Math.abs(dp[i][j] - (dp[i - 1][j] + GAP_PENALTY)) < 1e-6)) {
      // Profile advance, seq gap
      const existingCol = profile[i - 1];
      newProfile.unshift([
        ...existingCol,
        {
          trajectoryId: seq.id,
          gap: true,
        },
      ]);
      i--;
    } else {
      // Seq advance, profile gap across all existing sequences
      const step = seq.steps[j - 1];
      const gappedCol: ProfileSlot[] = [];
      for (let sIdx = 0; sIdx < numExistingSeqs; sIdx++) {
        gappedCol.push({
          trajectoryId: profile[0][sIdx].trajectoryId,
          gap: true,
        });
      }
      gappedCol.push({
        trajectoryId: seq.id,
        stepIndex: step.stepIndex,
        step,
        gap: false,
      });
      newProfile.unshift(gappedCol);
      j--;
    }
  }

  return newProfile;
}

/**
 * Performs progressive Multi-Sequence Alignment on N trajectories.
 */
export function alignMultipleTrajectories(
  trajectories: Trajectory[],
  options: ConsensusOptions
): AlignedConsensusColumn[] {
  if (trajectories.length === 0) {
    return [];
  }

  const sequences: TrajectorySequence[] = trajectories.map((traj, idx) => ({
    id: traj.scenarioId ? `${traj.scenarioId}-${idx + 1}` : `run-${idx + 1}`,
    steps: extractTrajectorySteps(traj),
  }));

  const totalCount = sequences.length;

  // Single sequence trivial case
  if (totalCount === 1) {
    const seq = sequences[0];
    return seq.steps.map((st, cIdx) => ({
      columnIndex: cIdx,
      slots: [
        {
          trajectoryId: seq.id,
          stepIndex: st.stepIndex,
          step: st,
          gap: false,
        },
      ],
      consensusStep: st,
      agreementRate: 1.0,
      level: 'invariant' as ConsensusStepLevel,
      dominantToolName: st.toolName,
      isBottleneck: true,
      isTrap: false,
      activeCount: 1,
      totalCount: 1,
    }));
  }

  // Calculate pairwise similarity matrix for guide order
  const pairScores: { i: number; j: number; score: number }[] = [];
  for (let i = 0; i < totalCount; i++) {
    for (let j = i + 1; j < totalCount; j++) {
      const score = computePairwiseScore(sequences[i].steps, sequences[j].steps, options.strictArgs);
      pairScores.push({ i, j, score });
    }
  }

  pairScores.sort((a, b) => b.score - a.score);

  // Initial pair
  const bestPair = pairScores[0] || { i: 0, j: 1, score: 0 };
  const alignedOrder: number[] = [bestPair.i, bestPair.j];
  const remaining = new Set<number>();
  for (let k = 0; k < totalCount; k++) {
    if (k !== bestPair.i && k !== bestPair.j) {
      remaining.add(k);
    }
  }

  // Initial profile of first sequence
  let profile: Profile = sequences[bestPair.i].steps.map((st) => [
    {
      trajectoryId: sequences[bestPair.i].id,
      stepIndex: st.stepIndex,
      step: st,
      gap: false,
    },
  ]);

  // Align second sequence
  profile = alignSequenceToProfile(profile, sequences[bestPair.j], options);

  // Progressively align remaining sequences
  while (remaining.size > 0) {
    // Pick remaining sequence closest to current profile
    let bestNext = -1;
    let maxSimilarity = -1;

    for (const rem of remaining) {
      // Find max similarity between rem and already aligned
      let simWithAligned = 0;
      for (const al of alignedOrder) {
        simWithAligned += computePairwiseScore(
          sequences[rem].steps,
          sequences[al].steps,
          options.strictArgs
        );
      }
      simWithAligned /= alignedOrder.length;
      if (simWithAligned > maxSimilarity) {
        maxSimilarity = simWithAligned;
        bestNext = rem;
      }
    }

    if (bestNext === -1) {
      bestNext = remaining.values().next().value as number;
    }

    profile = alignSequenceToProfile(profile, sequences[bestNext], options);
    alignedOrder.push(bestNext);
    remaining.delete(bestNext);
  }

  // Transform Profile into AlignedConsensusColumn[]
  const columns: AlignedConsensusColumn[] = profile.map((colSlots, colIdx) => {
    const activeSlots = colSlots.filter((slot) => !slot.gap && slot.step);
    const activeCount = activeSlots.length;

    // Determine consensus step (the dominant step)
    let dominantStep: TrajectoryStepSummary | undefined;
    let dominantTool: string | undefined;

    if (activeSlots.length > 0) {
      // Tool frequency map
      const toolCounts: Record<string, number> = {};
      for (const slot of activeSlots) {
        const t = slot.step?.toolName || (slot.step?.stepType === 'turn_end' ? '__turn_end__' : 'unknown');
        toolCounts[t] = (toolCounts[t] || 0) + 1;
      }
      let maxCount = -1;
      let topTool = '';
      for (const [tool, count] of Object.entries(toolCounts)) {
        if (count > maxCount) {
          maxCount = count;
          topTool = tool;
        }
      }
      dominantTool = topTool === '__turn_end__' ? undefined : topTool;

      // Find step matching topTool with best representative args
      const candidates = activeSlots.filter(
        (s) =>
          (s.step?.toolName || (s.step?.stepType === 'turn_end' ? '__turn_end__' : 'unknown')) === topTool
      );

      dominantStep = candidates[0].step;
    }

    // Agreement rate: matching slots count / totalCount
    let matchingCount = 0;
    if (dominantStep) {
      for (const slot of activeSlots) {
        if (slot.step) {
          const sim = calculateStepSimilarity(dominantStep, slot.step, options.strictArgs);
          if (sim >= options.similarityThreshold) {
            matchingCount++;
          }
        }
      }
    }

    const agreementRate = totalCount > 0 ? matchingCount / totalCount : 0;

    let level: ConsensusStepLevel = 'outlier';
    if (agreementRate >= 0.999 || matchingCount === totalCount) {
      level = 'invariant';
    } else if (agreementRate > 0.5) {
      level = 'majority';
    } else if (matchingCount > 1) {
      level = 'minority';
    } else {
      level = 'outlier';
    }

    return {
      columnIndex: colIdx,
      slots: colSlots.map((s) => ({
        trajectoryId: s.trajectoryId,
        stepIndex: s.stepIndex,
        step: s.step,
        gap: s.gap,
      })),
      consensusStep: dominantStep,
      agreementRate: Math.round(agreementRate * 100) / 100,
      level,
      dominantToolName: dominantTool,
      isBottleneck: false, // Refined by analyzer
      isTrap: false,       // Refined by analyzer
      activeCount,
      totalCount,
    };
  });

  return columns;
}

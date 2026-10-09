import { Trajectory, ToolCall } from '../core/types.js';
import { AlignedStep, StepAlignmentType, TrajectoryStepSummary } from './types.js';

/**
 * Extracts a linear sequence of execution steps from a Trajectory.
 */
export function extractTrajectorySteps(trajectory: Trajectory): TrajectoryStepSummary[] {
  const steps: TrajectoryStepSummary[] = [];
  let globalStepIndex = 0;

  for (const turn of trajectory.turns) {
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      for (const call of turn.toolCalls) {
        steps.push({
          turnNumber: turn.turnNumber,
          stepIndex: globalStepIndex++,
          stepType: 'tool',
          toolName: call.toolName,
          arguments: call.arguments,
          result: call.result,
          thought: turn.thought,
          durationMs: call.durationMs,
        });
      }
    }

    if (turn.assistantMessage !== undefined) {
      steps.push({
        turnNumber: turn.turnNumber,
        stepIndex: globalStepIndex++,
        stepType: 'turn_end',
        assistantMessage: turn.assistantMessage,
        thought: turn.thought,
      });
    }
  }

  return steps;
}

/**
 * Calculates step similarity score between 0.0 and 1.0.
 */
export function calculateStepSimilarity(
  a: TrajectoryStepSummary,
  b: TrajectoryStepSummary,
  strictArgs = false
): number {
  if (a.stepType !== b.stepType) {
    return 0.0;
  }

  if (a.stepType === 'turn_end') {
    const msgA = (a.assistantMessage || '').trim();
    const msgB = (b.assistantMessage || '').trim();
    if (msgA === msgB) return 1.0;
    if (msgA.length === 0 || msgB.length === 0) return 0.5;
    // Word set overlap (Jaccard)
    const wordsA = new Set(msgA.toLowerCase().split(/\s+/));
    const wordsB = new Set(msgB.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 ? 0.3 + 0.7 * (intersection / union) : 0.5;
  }

  // Tool steps comparison
  if (a.toolName !== b.toolName) {
    return 0.0;
  }

  // Base score for matching tool name
  let score = 0.5;

  // Compare arguments
  const argsA = a.arguments || {};
  const argsB = b.arguments || {};
  const keysA = Object.keys(argsA);
  const keysB = Object.keys(argsB);

  if (strictArgs) {
    const serializedA = JSON.stringify(argsA);
    const serializedB = JSON.stringify(argsB);
    if (serializedA === serializedB) {
      score += 0.35;
    } else {
      const allKeys = new Set([...keysA, ...keysB]);
      const commonKeys = keysA.filter((k) => keysB.includes(k));
      score += allKeys.size > 0 ? 0.2 * (commonKeys.length / allKeys.size) : 0.2;
    }
  } else {
    // Lenient argument comparison
    const allKeys = new Set([...keysA, ...keysB]);
    if (allKeys.size === 0) {
      score += 0.35;
    } else {
      let matchingValues = 0;
      for (const k of allKeys) {
        if (JSON.stringify(argsA[k]) === JSON.stringify(argsB[k])) {
          matchingValues += 1;
        }
      }
      score += 0.35 * (matchingValues / allKeys.size);
    }
  }

  // Result success/failure compatibility
  const successA = a.result?.success ?? true;
  const successB = b.result?.success ?? true;
  if (successA === successB) {
    score += 0.15;
  }

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Dynamic sequence alignment (Needleman-Wunsch variant) for Trajectory Steps.
 */
export function alignTrajectorySteps(
  baselineSteps: TrajectoryStepSummary[],
  candidateSteps: TrajectoryStepSummary[],
  minSimilarity = 0.6,
  strictArgs = false
): AlignedStep[] {
  const n = baselineSteps.length;
  const m = candidateSteps.length;

  if (n === 0 && m === 0) {
    return [];
  }

  // Handle trivial edge cases
  if (n === 0) {
    return candidateSteps.map((c, idx) => ({
      stepIndex: idx,
      candidateStep: c,
      alignmentType: 'added' as StepAlignmentType,
      similarity: 0,
      divergenceDetails: `Added step ${c.stepType}: ${c.toolName || 'turn_end'}`,
    }));
  }

  if (m === 0) {
    return baselineSteps.map((b, idx) => ({
      stepIndex: idx,
      baselineStep: b,
      alignmentType: 'removed' as StepAlignmentType,
      similarity: 0,
      divergenceDetails: `Removed step ${b.stepType}: ${b.toolName || 'turn_end'}`,
    }));
  }

  // Scoring parameters
  const GAP_PENALTY = -0.5;

  // Precompute similarity matrix
  const simMatrix: number[][] = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      simMatrix[i][j] = calculateStepSimilarity(baselineSteps[i], candidateSteps[j], strictArgs);
    }
  }

  // DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i * GAP_PENALTY;
  for (let j = 0; j <= m; j++) dp[0][j] = j * GAP_PENALTY;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = simMatrix[i - 1][j - 1];
      const matchScore = sim >= minSimilarity ? sim * 2.0 : -1.0;
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + matchScore,
        dp[i - 1][j] + GAP_PENALTY,
        dp[i][j - 1] + GAP_PENALTY
      );
    }
  }

  // Backtracking to construct aligned steps
  const aligned: AlignedStep[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = simMatrix[i - 1][j - 1];
      const matchScore = sim >= minSimilarity ? sim * 2.0 : -1.0;
      if (Math.abs(dp[i][j] - (dp[i - 1][j - 1] + matchScore)) < 1e-6) {
        const base = baselineSteps[i - 1];
        const cand = candidateSteps[j - 1];
        const isExact = sim >= 0.95;
        let diffDetails: string | undefined;

        if (!isExact) {
          if (base.stepType === 'tool' && cand.stepType === 'tool') {
            const argDiffs: string[] = [];
            const bArgs = base.arguments || {};
            const cArgs = cand.arguments || {};
            for (const k of new Set([...Object.keys(bArgs), ...Object.keys(cArgs)])) {
              if (JSON.stringify(bArgs[k]) !== JSON.stringify(cArgs[k])) {
                argDiffs.push(`${k}: ${JSON.stringify(bArgs[k])} -> ${JSON.stringify(cArgs[k])}`);
              }
            }
            diffDetails = argDiffs.length > 0 ? `Args changed: ${argDiffs.join('; ')}` : undefined;
            if (base.result?.success !== cand.result?.success) {
              diffDetails = `${diffDetails ? diffDetails + ', ' : ''}Outcome changed: success=${cand.result?.success}`;
            }
          } else {
            diffDetails = 'Assistant response content modified';
          }
        }

        aligned.unshift({
          stepIndex: 0, // will reindex at end
          baselineStep: base,
          candidateStep: cand,
          alignmentType: isExact ? 'match' : 'modified',
          similarity: sim,
          divergenceDetails: diffDetails,
        });
        i--;
        j--;
        continue;
      }
    }

    if (i > 0 && (j === 0 || Math.abs(dp[i][j] - (dp[i - 1][j] + GAP_PENALTY)) < 1e-6)) {
      const base = baselineSteps[i - 1];
      aligned.unshift({
        stepIndex: 0,
        baselineStep: base,
        alignmentType: 'removed',
        similarity: 0,
        divergenceDetails: `Omitted step ${base.stepType === 'tool' ? base.toolName : 'turn_end'}`,
      });
      i--;
    } else {
      const cand = candidateSteps[j - 1];
      aligned.unshift({
        stepIndex: 0,
        candidateStep: cand,
        alignmentType: 'added',
        similarity: 0,
        divergenceDetails: `Inserted step ${cand.stepType === 'tool' ? cand.toolName : 'turn_end'}`,
      });
      j--;
    }
  }

  // Re-index steps
  return aligned.map((step, idx) => ({
    ...step,
    stepIndex: idx,
  }));
}

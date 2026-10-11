import {
  AlignedConsensusColumn,
  CanonicalTrajectory,
  CanonicalTrajectoryTurn,
  ConsensusOptions,
} from './types.js';

export class CanonicalTrajectorySynthesizer {
  /**
   * Distills an optimal golden trajectory from consensus alignment columns.
   */
  public static synthesize(
    scenarioId: string,
    columns: AlignedConsensusColumn[],
    options: ConsensusOptions
  ): CanonicalTrajectory {
    if (columns.length === 0) {
      return {
        scenarioId,
        description: 'Synthesized canonical golden trajectory (empty)',
        confidenceScore: 0,
        synthesizedFromCount: 1,
        prunedOutlierStepsCount: 0,
        turns: [],
        totalSteps: 0,
      };
    }

    const totalCount = columns[0].totalCount;
    let prunedOutliers = 0;
    const selectedColumns: AlignedConsensusColumn[] = [];

    // Filter columns to keep high-confidence consensus path
    for (const col of columns) {
      if (!col.consensusStep) {
        continue;
      }

      // Drop traps and unverified single-run outliers
      if (col.isTrap && col.agreementRate < 0.5) {
        prunedOutliers++;
        continue;
      }

      if (col.level === 'outlier' && !col.isBottleneck) {
        prunedOutliers++;
        continue;
      }

      // Check min agreement threshold (relaxed for bottleneck checkpoints)
      const minThresh = col.isBottleneck ? 0.3 : (options.minAgreementRate ?? 0.5);
      if (col.agreementRate < minThresh) {
        prunedOutliers++;
        continue;
      }

      // Prevent exact consecutive duplicate tool calls (deduplication)
      if (selectedColumns.length > 0 && col.dominantToolName) {
        const lastCol = selectedColumns[selectedColumns.length - 1];
        if (
          lastCol.dominantToolName === col.dominantToolName &&
          JSON.stringify(lastCol.consensusStep?.arguments) ===
            JSON.stringify(col.consensusStep?.arguments)
        ) {
          prunedOutliers++;
          continue;
        }
      }

      selectedColumns.push(col);
    }

    // If all steps were pruned (e.g. extremely sparse), retain at least the highest agreement columns
    if (selectedColumns.length === 0) {
      const sorted = [...columns].sort((a, b) => b.agreementRate - a.agreementRate);
      if (sorted.length > 0 && sorted[0].consensusStep) {
        selectedColumns.push(sorted[0]);
      }
    }

    // Reconstruct into turns
    const turns: CanonicalTrajectoryTurn[] = [];
    let currentTurnNumber = 1;
    let currentToolCalls: Array<{
      toolName: string;
      arguments: Record<string, unknown>;
      result?: any;
      durationMs?: number;
    }> = [];
    let currentThought: string | undefined;

    for (const col of selectedColumns) {
      const step = col.consensusStep!;
      if (step.thought && !currentThought) {
        currentThought = step.thought;
      }

      if (step.stepType === 'tool' && step.toolName) {
        currentToolCalls.push({
          toolName: step.toolName,
          arguments: step.arguments || {},
          result: step.result,
          durationMs: step.durationMs,
        });
      } else if (step.stepType === 'turn_end') {
        turns.push({
          turnNumber: currentTurnNumber++,
          thought: currentThought,
          toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
          assistantMessage: step.assistantMessage || 'Step execution completed successfully',
        });
        currentToolCalls = [];
        currentThought = undefined;
      }
    }

    // Flush any pending tool calls into a final turn
    if (currentToolCalls.length > 0 || currentThought) {
      turns.push({
        turnNumber: currentTurnNumber++,
        thought: currentThought,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
        assistantMessage: 'Consensus goal achieved',
      });
    }

    // Calculate confidence score
    const avgAgreement =
      selectedColumns.length > 0
        ? selectedColumns.reduce((s, c) => s + c.agreementRate, 0) / selectedColumns.length
        : 0;
    const confidenceScore = Math.round(avgAgreement * 1000) / 10;

    return {
      scenarioId,
      description: `Synthesized canonical golden trajectory distilled from ${totalCount} runs`,
      confidenceScore,
      synthesizedFromCount: totalCount,
      prunedOutlierStepsCount: prunedOutliers,
      turns,
      totalSteps: selectedColumns.length,
    };
  }
}

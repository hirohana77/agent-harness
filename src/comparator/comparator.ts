import { HarnessReport, Trajectory } from '../core/types.js';
import {
  alignTrajectorySteps,
  extractTrajectorySteps,
} from './alignment.js';
import {
  detectAnomalies,
  evaluateRegression,
  findDivergences,
} from './analyzer.js';
import { TrajectoryCompareOptionsSchema } from './schemas.js';
import {
  AssertionDiffItem,
  ReportDiff,
  TrajectoryCompareOptions,
  TrajectoryDiff,
  TrajectoryDiffSummary,
} from './types.js';

export class TrajectoryComparator {
  /**
   * Compares two Trajectories (baseline vs candidate) and generates detailed differential analysis.
   */
  public static compare(
    baseline: Trajectory,
    candidate: Trajectory,
    rawOptions?: Partial<TrajectoryCompareOptions>
  ): TrajectoryDiff {
    const options: TrajectoryCompareOptions = TrajectoryCompareOptionsSchema.parse(rawOptions || {});

    // 1. Compute Metric Summary Deltas
    const baselinePromptTokens = baseline.turns.reduce(
      (sum, t) => sum + (t.tokensUsed?.promptTokens ?? 0),
      0
    );
    const candidatePromptTokens = candidate.turns.reduce(
      (sum, t) => sum + (t.tokensUsed?.promptTokens ?? 0),
      0
    );

    const baselineCompletionTokens = baseline.turns.reduce(
      (sum, t) => sum + (t.tokensUsed?.completionTokens ?? 0),
      0
    );
    const candidateCompletionTokens = candidate.turns.reduce(
      (sum, t) => sum + (t.tokensUsed?.completionTokens ?? 0),
      0
    );

    const baselineTotalTokens = baseline.summary?.totalTokens ?? (baselinePromptTokens + baselineCompletionTokens);
    const candidateTotalTokens = candidate.summary?.totalTokens ?? (candidatePromptTokens + candidateCompletionTokens);

    const baselineTurns = baseline.summary?.totalTurns ?? baseline.turns.length;
    const candidateTurns = candidate.summary?.totalTurns ?? candidate.turns.length;

    const baselineTools = baseline.summary?.totalToolCalls ?? baseline.turns.reduce((s, t) => s + (t.toolCalls?.length || 0), 0);
    const candidateTools = candidate.summary?.totalToolCalls ?? candidate.turns.reduce((s, t) => s + (t.toolCalls?.length || 0), 0);

    const summary: TrajectoryDiffSummary = {
      status: {
        baseline: baseline.status,
        candidate: candidate.status,
        regressed: baseline.status === 'completed' && candidate.status !== 'completed',
      },
      turns: {
        baseline: baselineTurns,
        candidate: candidateTurns,
        delta: candidateTurns - baselineTurns,
      },
      toolCalls: {
        baseline: baselineTools,
        candidate: candidateTools,
        delta: candidateTools - baselineTools,
      },
      tokens: {
        baselinePrompt: baselinePromptTokens,
        candidatePrompt: candidatePromptTokens,
        promptDelta: candidatePromptTokens - baselinePromptTokens,
        baselineCompletion: baselineCompletionTokens,
        candidateCompletion: candidateCompletionTokens,
        completionDelta: candidateCompletionTokens - baselineCompletionTokens,
        baselineTotal: baselineTotalTokens,
        candidateTotal: candidateTotalTokens,
        totalDelta: candidateTotalTokens - baselineTotalTokens,
      },
      durationMs: {
        baseline: baseline.durationMs || 0,
        candidate: candidate.durationMs || 0,
        delta: (candidate.durationMs || 0) - (baseline.durationMs || 0),
      },
      costUsd: {
        baseline: baseline.summary?.costUsd || 0,
        candidate: candidate.summary?.costUsd || 0,
        delta: (candidate.summary?.costUsd || 0) - (baseline.summary?.costUsd || 0),
      },
    };

    // 2. Compute Tool Distribution Map
    const toolDistribution: Record<string, { baseline: number; candidate: number; delta: number }> = {};
    for (const turn of baseline.turns) {
      for (const call of turn.toolCalls || []) {
        if (!toolDistribution[call.toolName]) {
          toolDistribution[call.toolName] = { baseline: 0, candidate: 0, delta: 0 };
        }
        toolDistribution[call.toolName].baseline += 1;
      }
    }
    for (const turn of candidate.turns) {
      for (const call of turn.toolCalls || []) {
        if (!toolDistribution[call.toolName]) {
          toolDistribution[call.toolName] = { baseline: 0, candidate: 0, delta: 0 };
        }
        toolDistribution[call.toolName].candidate += 1;
      }
    }
    for (const key of Object.keys(toolDistribution)) {
      toolDistribution[key].delta = toolDistribution[key].candidate - toolDistribution[key].baseline;
    }

    // 3. Step Extraction and Dynamic Alignment
    const baselineSteps = extractTrajectorySteps(baseline);
    const candidateSteps = extractTrajectorySteps(candidate);
    const alignment = alignTrajectorySteps(
      baselineSteps,
      candidateSteps,
      options.minSimilarityThreshold,
      options.strictArgs
    );

    // 4. Anomalies & Divergence Point Detection
    const anomalies = detectAnomalies(baseline, candidate, options);
    const { firstDivergence, allDivergences } = findDivergences(alignment, baseline, candidate);

    // 5. Regression Evaluation
    const regression = evaluateRegression(baseline, candidate, alignment, anomalies, allDivergences);

    return {
      scenarioId: candidate.scenarioId || baseline.scenarioId || 'unknown',
      summary,
      firstDivergence,
      allDivergences,
      alignment,
      regression,
      toolDistribution,
    };
  }

  /**
   * Compares two HarnessReports, including assertion passes/failures and optional trajectory diffs.
   */
  public static compareReports(
    baselineReport: HarnessReport,
    candidateReport: HarnessReport,
    baselineTraj?: Trajectory,
    candidateTraj?: Trajectory,
    rawOptions?: Partial<TrajectoryCompareOptions>
  ): ReportDiff {
    const assertionMap = new Map<
      string,
      {
        type: 'file' | 'command' | 'trajectory' | 'ast';
        target: string;
        baselinePassed?: boolean;
        candidatePassed?: boolean;
        message?: string;
      }
    >();

    for (const item of baselineReport.assertionResults || []) {
      const key = `${item.type}:${item.target}`;
      assertionMap.set(key, {
        type: item.type,
        target: item.target,
        baselinePassed: item.passed,
        message: item.message,
      });
    }

    for (const item of candidateReport.assertionResults || []) {
      const key = `${item.type}:${item.target}`;
      const existing = assertionMap.get(key);
      if (existing) {
        existing.candidatePassed = item.passed;
        if (!item.passed) {
          existing.message = item.message;
        }
      } else {
        assertionMap.set(key, {
          type: item.type,
          target: item.target,
          candidatePassed: item.passed,
          message: item.message,
        });
      }
    }

    const assertions: AssertionDiffItem[] = [];
    let hasRegression = false;

    for (const [, item] of assertionMap.entries()) {
      const bPass = item.baselinePassed ?? true;
      const cPass = item.candidatePassed ?? false;

      let status: AssertionDiffItem['status'] = 'maintained_pass';
      if (bPass && cPass) {
        status = 'maintained_pass';
      } else if (!bPass && !cPass) {
        status = 'maintained_fail';
      } else if (bPass && !cPass) {
        status = 'regression';
        hasRegression = true;
      } else if (!bPass && cPass) {
        status = 'improvement';
      }

      assertions.push({
        type: item.type,
        target: item.target,
        baselinePassed: bPass,
        candidatePassed: cPass,
        status,
        message: item.message,
      });
    }

    const baselinePassed = baselineReport.passed;
    const candidatePassed = candidateReport.passed;
    const isRegression = hasRegression || (baselinePassed && !candidatePassed);

    let trajectoryDiff: TrajectoryDiff | undefined;
    if (baselineTraj && candidateTraj) {
      trajectoryDiff = TrajectoryComparator.compare(baselineTraj, candidateTraj, rawOptions);
    }

    return {
      scenarioId: candidateReport.scenarioId || baselineReport.scenarioId,
      baselinePassed,
      candidatePassed,
      isRegression,
      assertions,
      trajectoryDiff,
    };
  }
}

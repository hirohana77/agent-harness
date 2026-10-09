import { Trajectory } from '../core/types.js';
import {
  AlignedStep,
  DivergencePoint,
  DivergenceType,
  RegressionSeverity,
  TrajectoryAnomaly,
  TrajectoryCompareOptions,
  TrajectoryRegressionAnalysis,
} from './types.js';

export function detectAnomalies(
  baseline: Trajectory,
  candidate: Trajectory,
  options?: TrajectoryCompareOptions
): TrajectoryAnomaly[] {
  const anomalies: TrajectoryAnomaly[] = [];
  const tokenRegressionRatio = options?.tokenRegressionRatio ?? 0.5;

  // 1. Tool Call Loops
  const consecutiveCalls: { toolName: string; argsStr: string; count: number; turnNumber: number }[] = [];
  for (const turn of candidate.turns) {
    for (const tool of turn.toolCalls || []) {
      const argsStr = JSON.stringify(tool.arguments || {});
      const last = consecutiveCalls[consecutiveCalls.length - 1];
      if (last && last.toolName === tool.toolName && last.argsStr === argsStr) {
        last.count += 1;
        if (last.count === 3) {
          anomalies.push({
            type: 'loop_detected',
            message: `Repetitive tool invocation loop detected for '${tool.toolName}' with identical arguments (${last.count} times)`,
            turnNumber: turn.turnNumber,
            details: { toolName: tool.toolName, arguments: tool.arguments, repeatCount: last.count },
          });
        }
      } else {
        consecutiveCalls.push({
          toolName: tool.toolName,
          argsStr,
          count: 1,
          turnNumber: turn.turnNumber,
        });
      }
    }
  }

  // 2. Error Spike
  let baselineErrors = 0;
  for (const turn of baseline.turns) {
    for (const tool of turn.toolCalls || []) {
      if (tool.result && tool.result.success === false) {
        baselineErrors++;
      }
    }
  }

  let candidateErrors = 0;
  for (const turn of candidate.turns) {
    for (const tool of turn.toolCalls || []) {
      if (tool.result && tool.result.success === false) {
        candidateErrors++;
      }
    }
  }

  if (candidateErrors > baselineErrors && candidateErrors >= 2) {
    anomalies.push({
      type: 'error_spike',
      message: `Tool execution error spike: candidate suffered ${candidateErrors} failures vs ${baselineErrors} in baseline`,
      details: { baselineErrors, candidateErrors, errorDelta: candidateErrors - baselineErrors },
    });
  }

  // 3. Token Explosion
  const baselineTokens = baseline.summary?.totalTokens ?? 0;
  const candidateTokens = candidate.summary?.totalTokens ?? 0;
  if (baselineTokens > 0 && candidateTokens > baselineTokens * (1 + tokenRegressionRatio)) {
    const growthPercent = Math.round(((candidateTokens - baselineTokens) / baselineTokens) * 100);
    anomalies.push({
      type: 'token_explosion',
      message: `Token consumption escalated by ${growthPercent}% (${candidateTokens} vs ${baselineTokens})`,
      details: { baselineTokens, candidateTokens, growthPercent },
    });
  }

  // 4. Empty Turns
  for (const turn of candidate.turns) {
    const noTools = !turn.toolCalls || turn.toolCalls.length === 0;
    const noMsg = !turn.assistantMessage || turn.assistantMessage.trim().length === 0;
    if (noTools && noMsg) {
      anomalies.push({
        type: 'empty_turn',
        message: `Candidate turn ${turn.turnNumber} contains neither tool calls nor assistant message`,
        turnNumber: turn.turnNumber,
      });
    }
  }

  // 5. Rapid Failure
  const baselineSuccess = baseline.status === 'completed';
  const candidateSuccess = candidate.status === 'completed';
  if (baselineSuccess && !candidateSuccess && candidate.turns.length <= 2) {
    anomalies.push({
      type: 'rapid_failure',
      message: `Candidate terminated prematurely with status '${candidate.status}' in turn ${candidate.turns.length}`,
      turnNumber: candidate.turns.length,
      details: { status: candidate.status, turnsCount: candidate.turns.length },
    });
  }

  return anomalies;
}

export function findDivergences(
  alignment: AlignedStep[],
  baseline: Trajectory,
  candidate: Trajectory
): { firstDivergence?: DivergencePoint; allDivergences: DivergencePoint[] } {
  const allDivergences: DivergencePoint[] = [];

  for (const step of alignment) {
    if (step.alignmentType === 'match') {
      continue;
    }

    let type: DivergenceType = 'tool_mismatch';
    let description = '';
    const turnNumber = step.candidateStep?.turnNumber ?? step.baselineStep?.turnNumber ?? 0;

    if (step.alignmentType === 'modified') {
      if (
        step.baselineStep?.result?.success === true &&
        step.candidateStep?.result?.success === false
      ) {
        type = 'tool_failure';
        description = `Tool '${step.candidateStep?.toolName}' failed in candidate: ${step.candidateStep?.result?.error || 'Unknown error'}`;
      } else if (step.baselineStep?.toolName === step.candidateStep?.toolName) {
        type = 'arg_mismatch';
        description = `Tool '${step.candidateStep?.toolName}' arguments diverged: ${step.divergenceDetails || 'parameter differences'}`;
      } else {
        type = 'tool_mismatch';
        description = `Action diverged at step ${step.stepIndex}: '${step.baselineStep?.toolName || 'turn_end'}' vs '${step.candidateStep?.toolName || 'turn_end'}'`;
      }
    } else if (step.alignmentType === 'added') {
      type = 'tool_mismatch';
      description = `Candidate introduced additional action: '${step.candidateStep?.toolName || 'turn_end'}'`;
    } else if (step.alignmentType === 'removed') {
      type = 'premature_exit';
      description = `Candidate skipped baseline action: '${step.baselineStep?.toolName || 'turn_end'}'`;
    }

    allDivergences.push({
      turnNumber,
      stepIndex: step.stepIndex,
      type,
      description,
      baseline: step.baselineStep
        ? {
            toolName: step.baselineStep.toolName,
            args: step.baselineStep.arguments,
            error: step.baselineStep.result?.error,
            status: baseline.status,
          }
        : undefined,
      candidate: step.candidateStep
        ? {
            toolName: step.candidateStep.toolName,
            args: step.candidateStep.arguments,
            error: step.candidateStep.result?.error,
            status: candidate.status,
          }
        : undefined,
    });
  }

  // If status diverged and wasn't captured in steps
  if (baseline.status === 'completed' && candidate.status !== 'completed' && allDivergences.length === 0) {
    allDivergences.push({
      turnNumber: candidate.turns.length,
      stepIndex: alignment.length,
      type: 'status_regression',
      description: `Candidate ended with '${candidate.status}' whereas baseline was 'completed'`,
      baseline: { status: baseline.status },
      candidate: { status: candidate.status },
    });
  }

  return {
    firstDivergence: allDivergences[0],
    allDivergences,
  };
}

export function evaluateRegression(
  baseline: Trajectory,
  candidate: Trajectory,
  alignment: AlignedStep[],
  anomalies: TrajectoryAnomaly[],
  allDivergences: DivergencePoint[]
): TrajectoryRegressionAnalysis {
  const reasons: string[] = [];
  const baselineSuccess = baseline.status === 'completed';
  const candidateSuccess = candidate.status === 'completed';

  let score = 1.0;

  // Status check
  if (baselineSuccess && !candidateSuccess) {
    score -= 0.45;
    reasons.push(`Candidate status regressed from '${baseline.status}' to '${candidate.status}'`);
  }

  // Alignment similarity
  if (alignment.length > 0) {
    const totalSim = alignment.reduce((acc, step) => {
      if (step.alignmentType === 'match') return acc + 1.0;
      if (step.alignmentType === 'modified') return acc + step.similarity * 0.7;
      return acc;
    }, 0);
    const alignmentRatio = totalSim / alignment.length;
    score = score * (0.4 + 0.6 * alignmentRatio);
  }

  // Anomaly penalties
  for (const anomaly of anomalies) {
    switch (anomaly.type) {
      case 'loop_detected':
        score -= 0.25;
        reasons.push(`Repetitive invocation loop detected: ${anomaly.message}`);
        break;
      case 'rapid_failure':
        score -= 0.3;
        reasons.push(`Premature crash: ${anomaly.message}`);
        break;
      case 'error_spike':
        score -= 0.15;
        reasons.push(`Tool failure rate increased: ${anomaly.message}`);
        break;
      case 'token_explosion':
        score -= 0.1;
        reasons.push(`Token consumption inflated: ${anomaly.message}`);
        break;
      case 'empty_turn':
        score -= 0.05;
        reasons.push(`Ineffective empty turn detected: ${anomaly.message}`);
        break;
    }
  }

  // Divergence count penalty
  if (allDivergences.length > 0 && reasons.length === 0) {
    reasons.push(`Encountered ${allDivergences.length} execution divergences from baseline trajectory`);
  }

  score = Math.max(0.0, Math.min(1.0, Math.round(score * 100) / 100));

  let severity: RegressionSeverity = 'identical';
  if (score >= 0.99 && allDivergences.length === 0) {
    severity = 'identical';
  } else if (score >= 0.85 && candidateSuccess) {
    severity = 'equivalent';
  } else if (score >= 0.65 && candidateSuccess) {
    severity = 'minor_drift';
  } else if (candidateSuccess && score < 0.65) {
    severity = 'regression';
  } else if (!candidateSuccess && baselineSuccess) {
    severity = score <= 0.3 ? 'critical_failure' : 'regression';
  } else {
    severity = score < 0.5 ? 'critical_failure' : 'regression';
  }

  const isRegression =
    severity === 'regression' ||
    severity === 'critical_failure' ||
    (baselineSuccess && !candidateSuccess) ||
    anomalies.some((a) => a.type === 'loop_detected' || a.type === 'rapid_failure');

  return {
    severity,
    score,
    isRegression,
    reasons,
    anomalies,
  };
}

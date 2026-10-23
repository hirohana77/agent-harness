import { Trajectory, ToolCall } from "../core/types.js";
import { SnapshotManager } from "./snapshot.js";
import {
  BisectEvaluationStep,
  BisectOptions,
  BisectResult,
  BuiltinPredicateType,
  TurnSnapshot,
} from "./types.js";

export class TrajectoryBisector {
  private trajectory: Trajectory;
  private snapshotManager: SnapshotManager;

  constructor(trajectory: Trajectory, snapshotManager?: SnapshotManager) {
    this.trajectory = trajectory;
    this.snapshotManager = snapshotManager ?? new SnapshotManager(trajectory);
  }

  public async bisect(options: BisectOptions = {}): Promise<BisectResult> {
    const startTime = Date.now();
    const snapshots = this.snapshotManager.getAllSnapshots();

    if (snapshots.length === 0) {
      return {
        firstFaultyTurn: null,
        stepsEvaluated: 0,
        evaluations: [],
        rootCauseDescription: "Trajectory contains no turns to bisect.",
        confidence: 0,
        durationMs: 0,
      };
    }

    const minTurn = snapshots[0].turnNumber;
    const maxTurn = snapshots[snapshots.length - 1].turnNumber;

    let low = Math.max(minTurn, options.lowTurn ?? minTurn);
    let high = Math.min(maxTurn, options.highTurn ?? maxTurn);

    const evaluations: BisectEvaluationStep[] = [];
    const predicateType: BuiltinPredicateType = options.predicateType ?? "exit-code-success";

    const evaluateTurn = async (turnNum: number): Promise<boolean> => {
      const snap = this.snapshotManager.getSnapshot(turnNum);
      if (!snap) return false;

      let passed = true;
      let reason: string | undefined;

      if (options.customPredicate) {
        try {
          passed = await options.customPredicate(snap, turnNum);
          reason = passed ? "Custom predicate passed" : "Custom predicate returned false";
        } catch (err: any) {
          passed = false;
          reason = `Custom predicate exception: ${err.message}`;
        }
      } else {
        switch (predicateType) {
          case "exit-code-success": {
            const failingCall = snap.toolCalls.find(
              (c) =>
                c.result &&
                ((c.result.exitCode !== undefined && c.result.exitCode !== 0) ||
                  c.result.success === false)
            );
            if (failingCall) {
              passed = false;
              reason = `Tool call '${failingCall.toolName}' returned exit code ${failingCall.result?.exitCode ?? "non-zero"} or success=false`;
            } else {
              passed = true;
              reason = "All tool calls succeeded with exit code 0";
            }
            break;
          }
          case "file-exists": {
            const targetPath = options.predicateArg;
            if (targetPath && snap.virtualFs[targetPath]) {
              passed = true;
              reason = `File '${targetPath}' exists in virtual filesystem`;
            } else {
              passed = false;
              reason = `File '${targetPath}' missing in virtual filesystem`;
            }
            break;
          }
          case "file-contains": {
            const arg = options.predicateArg || "";
            const [targetPath, pattern] = arg.includes(":") ? arg.split(":", 2) : [arg, ""];
            const file = snap.virtualFs[targetPath];
            if (file && (!pattern || file.content.includes(pattern))) {
              passed = true;
              reason = `File '${targetPath}' contains pattern '${pattern}'`;
            } else {
              passed = false;
              reason = !file
                ? `File '${targetPath}' not found`
                : `File '${targetPath}' does not contain '${pattern}'`;
            }
            break;
          }
          case "no-error-output": {
            const errorRegex = /(error|exception|fatal|failed|panic)/i;
            const errorCall = snap.toolCalls.find(
              (c) =>
                (c.result?.error && errorRegex.test(c.result.error)) ||
                (c.result?.output && errorRegex.test(c.result.output))
            );
            if (errorCall) {
              passed = false;
              reason = `Error pattern matched in output of '${errorCall.toolName}'`;
            } else {
              passed = true;
              reason = "No error pattern found in tool outputs";
            }
            break;
          }
          default:
            passed = true;
            reason = "Default pass";
        }
      }

      evaluations.push({
        turnNumber: turnNum,
        passed,
        reason,
        snapshotSnippet: `Tools: ${snap.toolCalls.map((c) => c.toolName).join(", ") || "none"}`,
      });

      return passed;
    };

    // First check high turn: if high turn passes, there is no fault in range
    const highPassed = await evaluateTurn(high);
    if (highPassed) {
      return {
        firstFaultyTurn: null,
        stepsEvaluated: evaluations.length,
        evaluations,
        rootCauseDescription: `All steps between turn ${low} and ${high} satisfied predicate '${predicateType}'. No regression detected.`,
        confidence: 1.0,
        durationMs: Date.now() - startTime,
      };
    }

    // Binary search
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const passed = await evaluateTurn(mid);

      if (passed) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const firstFaultyTurn = low;
    const faultySnapshot = this.snapshotManager.getSnapshot(firstFaultyTurn);
    let faultyToolCall: ToolCall | undefined;
    let rootCauseDescription = `Failure inflection point pinpointed at Turn ${firstFaultyTurn}.`;

    if (faultySnapshot) {
      faultyToolCall = faultySnapshot.toolCalls.find(
        (c) =>
          c.result &&
          ((c.result.exitCode !== undefined && c.result.exitCode !== 0) ||
            c.result.success === false)
      ) || faultySnapshot.toolCalls[0];

      if (faultyToolCall) {
        rootCauseDescription = `Turn ${firstFaultyTurn} invoked '${faultyToolCall.toolName}' with exit code ${
          faultyToolCall.result?.exitCode ?? "unknown"
        }: ${faultyToolCall.result?.output?.slice(0, 120) || faultyToolCall.result?.error || "unknown error"}`;
      }
    }

    return {
      firstFaultyTurn,
      faultyToolCall,
      stepsEvaluated: evaluations.length,
      evaluations,
      rootCauseDescription,
      confidence: 0.95,
      durationMs: Date.now() - startTime,
    };
  }
}

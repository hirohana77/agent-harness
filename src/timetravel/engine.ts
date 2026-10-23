import { Trajectory } from "../core/types.js";
import { SnapshotManager } from "./snapshot.js";
import { TimeTravelStepper } from "./stepper.js";
import { TrajectoryBisector } from "./bisect.js";
import { CounterfactualEngine } from "./counterfactual.js";
import {
  BisectOptions,
  BisectResult,
  CounterfactualBranch,
  CounterfactualOptions,
  TimelineTurnEntry,
  TimeTravelReport,
  TimeTravelSessionOptions,
} from "./types.js";

export interface ReportGenerationOptions {
  sessionOptions?: TimeTravelSessionOptions;
  runBisect?: boolean;
  bisectOptions?: BisectOptions;
  counterfactualBranches?: CounterfactualBranch[];
}

export class TimeTravelEngine {
  private counterfactualEngine: CounterfactualEngine;

  constructor() {
    this.counterfactualEngine = new CounterfactualEngine();
  }

  public createSession(
    trajectory: Trajectory,
    options?: TimeTravelSessionOptions
  ): { stepper: TimeTravelStepper; snapshotManager: SnapshotManager } {
    const snapshotManager = new SnapshotManager(trajectory, options);
    const stepper = new TimeTravelStepper(trajectory, snapshotManager);
    return { stepper, snapshotManager };
  }

  public async bisect(
    trajectory: Trajectory,
    options?: BisectOptions,
    sessionOptions?: TimeTravelSessionOptions
  ): Promise<BisectResult> {
    const snapshotManager = new SnapshotManager(trajectory, sessionOptions);
    const bisector = new TrajectoryBisector(trajectory, snapshotManager);
    return await bisector.bisect(options);
  }

  public async forkBranch(
    trajectory: Trajectory,
    options: CounterfactualOptions
  ): Promise<CounterfactualBranch> {
    return await this.counterfactualEngine.forkAndSimulate(trajectory, options);
  }

  public async generateReport(
    trajectory: Trajectory,
    options: ReportGenerationOptions = {}
  ): Promise<TimeTravelReport> {
    const snapshotManager = new SnapshotManager(trajectory, options.sessionOptions);
    const snapshots = snapshotManager.getAllSnapshots();

    const timeline: TimelineTurnEntry[] = snapshots.map((snap) => {
      const exitCodes = snap.toolCalls
        .map((c) => c.result?.exitCode)
        .filter((code): code is number => code !== undefined);

      const hasFailure = snap.toolCalls.some(
        (c) =>
          c.result &&
          ((c.result.exitCode !== undefined && c.result.exitCode !== 0) ||
            c.result.success === false)
      );

      return {
        turnNumber: snap.turnNumber,
        toolNames: snap.toolCalls.map((c) => c.toolName),
        exitCodes,
        deltasCount: snap.fileDeltas.length,
        status: hasFailure ? "failure" : snap.fileDeltas.length > 0 ? "warning" : "success",
      };
    });

    let bisectResult: BisectResult | undefined;
    if (options.runBisect || options.bisectOptions) {
      const bisector = new TrajectoryBisector(trajectory, snapshotManager);
      bisectResult = await bisector.bisect(options.bisectOptions);
    }

    const branches = options.counterfactualBranches || [];

    const recommendations: string[] = [];
    if (bisectResult && bisectResult.firstFaultyTurn !== null) {
      recommendations.push(
        `Root-cause regression introduced at Turn ${bisectResult.firstFaultyTurn}. Intervene at or before this turn to preserve trajectory invariants.`
      );
    }

    const rescuedBranch = branches.find((b) => b.outcomeDelta.statusChange === "rescued");
    if (rescuedBranch) {
      recommendations.push(
        `Counterfactual mutation at Turn ${rescuedBranch.forkTurn} successfully rescued execution (${rescuedBranch.outcomeDelta.branchTurns} turns vs ${rescuedBranch.outcomeDelta.originalTurns} baseline).`
      );
    }

    const modifiedCount = snapshots.reduce(
      (acc, s) => acc + s.fileDeltas.filter((d) => d.type === "modified").length,
      0
    );
    if (modifiedCount > 10) {
      recommendations.push(
        `High workspace mutation frequency (${modifiedCount} modifications detected across ${snapshots.length} turns). Consider setting file watchpoints.`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Trajectory executed deterministically without detected invariant regressions.");
    }

    return {
      scenarioId: trajectory.scenarioId,
      totalTurns: trajectory.turns.length,
      snapshotsCount: snapshots.length,
      timeline,
      bisectResult,
      counterfactualBranches: branches,
      recommendations,
      timestamp: new Date().toISOString(),
    };
  }
}

import { Trajectory } from "../core/types.js";
import { SnapshotManager } from "./snapshot.js";
import {
  Breakpoint,
  BreakpointCondition,
  StepResult,
  TurnSnapshot,
  Watchpoint,
  WatchpointTriggerType,
} from "./types.js";

export class TimeTravelStepper {
  private trajectory: Trajectory;
  private snapshotManager: SnapshotManager;
  private currentTurnNumber: number;
  private minTurn: number;
  private maxTurn: number;
  private breakpoints: Map<string, Breakpoint> = new Map();
  private watchpoints: Map<string, Watchpoint> = new Map();

  constructor(trajectory: Trajectory, snapshotManager: SnapshotManager) {
    this.trajectory = trajectory;
    this.snapshotManager = snapshotManager;

    const allSnaps = snapshotManager.getAllSnapshots();
    if (allSnaps.length === 0) {
      throw new Error("Cannot initialize TimeTravelStepper with empty snapshots");
    }

    this.minTurn = allSnaps[0].turnNumber;
    this.maxTurn = allSnaps[allSnaps.length - 1].turnNumber;
    this.currentTurnNumber = this.minTurn;
  }

  public getCurrentTurn(): number {
    return this.currentTurnNumber;
  }

  public getCurrentSnapshot(): TurnSnapshot {
    const snap = this.snapshotManager.getSnapshot(this.currentTurnNumber);
    if (!snap) {
      throw new Error(`Snapshot for turn ${this.currentTurnNumber} not found.`);
    }
    return snap;
  }

  public setBreakpoint(
    condition: BreakpointCondition,
    options?: { id?: string; name?: string; action?: "pause" | "log" }
  ): Breakpoint {
    const id = options?.id || `bp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const bp: Breakpoint = {
      id,
      name: options?.name,
      enabled: true,
      condition,
      hitCount: 0,
      action: options?.action || "pause",
    };
    this.breakpoints.set(id, bp);
    return bp;
  }

  public removeBreakpoint(id: string): boolean {
    return this.breakpoints.delete(id);
  }

  public getBreakpoints(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  public setWatchpoint(
    path: string,
    triggerOn: WatchpointTriggerType = "any",
    options?: { id?: string }
  ): Watchpoint {
    const id = options?.id || `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const wp: Watchpoint = {
      id,
      path,
      triggerOn,
      enabled: true,
      hitCount: 0,
    };
    this.watchpoints.set(id, wp);
    return wp;
  }

  public removeWatchpoint(id: string): boolean {
    return this.watchpoints.delete(id);
  }

  public getWatchpoints(): Watchpoint[] {
    return Array.from(this.watchpoints.values());
  }

  private checkBreakpointHits(snapshot: TurnSnapshot): Breakpoint[] {
    const hits: Breakpoint[] = [];

    for (const bp of this.breakpoints.values()) {
      if (!bp.enabled) continue;
      const cond = bp.condition;
      let matched = false;

      switch (cond.type) {
        case "turn":
          matched = snapshot.turnNumber === cond.turnNumber;
          break;
        case "tool":
          matched = snapshot.toolCalls.some(
            (call) => call.toolName.toLowerCase() === cond.toolName?.toLowerCase()
          );
          break;
        case "exit-code":
          matched = snapshot.toolCalls.some(
            (call) => call.result?.exitCode === cond.exitCode
          );
          break;
        case "error-pattern":
          if (cond.pattern) {
            const regex = new RegExp(cond.pattern, "i");
            matched = snapshot.toolCalls.some(
              (call) =>
                (call.result?.output && regex.test(call.result.output)) ||
                (call.result?.error && regex.test(call.result.error))
            );
          }
          break;
        case "file-changed":
          if (cond.filePath) {
            matched = snapshot.fileDeltas.some((d) => d.path === cond.filePath);
          }
          break;
        case "custom":
          if (cond.predicate) {
            matched = cond.predicate(snapshot);
          }
          break;
      }

      if (matched) {
        bp.hitCount++;
        hits.push(bp);
      }
    }

    return hits;
  }

  private checkWatchpointHits(snapshot: TurnSnapshot): Watchpoint[] {
    const hits: Watchpoint[] = [];

    for (const wp of this.watchpoints.values()) {
      if (!wp.enabled) continue;

      const delta = snapshot.fileDeltas.find((d) => d.path === wp.path);
      if (delta) {
        let trigger = false;
        if (wp.triggerOn === "any") trigger = true;
        else if (wp.triggerOn === "create" && delta.type === "created") trigger = true;
        else if (wp.triggerOn === "modify" && delta.type === "modified") trigger = true;
        else if (wp.triggerOn === "delete" && delta.type === "deleted") trigger = true;

        if (trigger) {
          wp.hitCount++;
          hits.push(wp);
        }
      }
    }

    return hits;
  }

  public stepForward(): StepResult {
    if (this.currentTurnNumber < this.maxTurn) {
      this.currentTurnNumber++;
    }

    const snapshot = this.getCurrentSnapshot();
    const hitBreakpoints = this.checkBreakpointHits(snapshot);
    const hitWatchpoints = this.checkWatchpointHits(snapshot);

    return {
      currentTurn: this.currentTurnNumber,
      snapshot,
      hitBreakpoints,
      hitWatchpoints,
      isEnd: this.currentTurnNumber >= this.maxTurn,
      isStart: this.currentTurnNumber <= this.minTurn,
    };
  }

  public stepBackward(): StepResult {
    if (this.currentTurnNumber > this.minTurn) {
      this.currentTurnNumber--;
    }

    const snapshot = this.getCurrentSnapshot();
    const hitBreakpoints = this.checkBreakpointHits(snapshot);
    const hitWatchpoints = this.checkWatchpointHits(snapshot);

    return {
      currentTurn: this.currentTurnNumber,
      snapshot,
      hitBreakpoints,
      hitWatchpoints,
      isEnd: this.currentTurnNumber >= this.maxTurn,
      isStart: this.currentTurnNumber <= this.minTurn,
    };
  }

  public jumpToTurn(turnNumber: number): StepResult {
    if (turnNumber < this.minTurn || turnNumber > this.maxTurn) {
      throw new Error(
        `Invalid turnNumber ${turnNumber}. Must be between ${this.minTurn} and ${this.maxTurn}.`
      );
    }

    this.currentTurnNumber = turnNumber;
    const snapshot = this.getCurrentSnapshot();
    const hitBreakpoints = this.checkBreakpointHits(snapshot);
    const hitWatchpoints = this.checkWatchpointHits(snapshot);

    return {
      currentTurn: this.currentTurnNumber,
      snapshot,
      hitBreakpoints,
      hitWatchpoints,
      isEnd: this.currentTurnNumber >= this.maxTurn,
      isStart: this.currentTurnNumber <= this.minTurn,
    };
  }

  public reset(): StepResult {
    return this.jumpToTurn(this.minTurn);
  }

  public runUntilBreakpoint(): StepResult {
    let result = this.stepForward();

    while (!result.isEnd) {
      if (result.hitBreakpoints.length > 0 || result.hitWatchpoints.length > 0) {
        break;
      }
      result = this.stepForward();
    }

    return result;
  }
}

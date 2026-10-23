import { createHash } from "node:crypto";
import { Trajectory, ToolCall } from "../core/types.js";
import {
  FileDelta,
  FileDeltaType,
  TimeTravelSessionOptions,
  TurnSnapshot,
  VirtualFile,
  VirtualFSState,
} from "./types.js";

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export class SnapshotManager {
  private trajectory: Trajectory;
  private snapshots: Map<number, TurnSnapshot> = new Map();
  private options: Required<TimeTravelSessionOptions>;

  constructor(trajectory: Trajectory, options: TimeTravelSessionOptions = {}) {
    this.trajectory = trajectory;
    this.options = {
      initialFiles: options.initialFiles || {},
      initialEnv: options.initialEnv || {},
      enableDeltaCompression: options.enableDeltaCompression ?? true,
      maxCachedSnapshots: options.maxCachedSnapshots ?? 500,
    };

    this.buildSnapshots();
  }

  private buildSnapshots(): void {
    let currentFs: VirtualFSState = {};

    // Initialize with initialFiles
    for (const [filePath, content] of Object.entries(this.options.initialFiles)) {
      currentFs[filePath] = {
        path: filePath,
        content,
        hash: computeContentHash(content),
        size: Buffer.byteLength(content, "utf8"),
        lastModifiedTurn: 0,
      };
    }

    let currentEnv: Record<string, string> = { ...this.options.initialEnv };
    let cumulativeTokens = 0;

    for (let i = 0; i < this.trajectory.turns.length; i++) {
      const turn = this.trajectory.turns[i];
      const turnNum = turn.turnNumber ?? i + 1;
      const previousFs = currentFs;

      // Clone currentFs for mutation
      const nextFs: VirtualFSState = {};
      for (const [k, v] of Object.entries(previousFs)) {
        nextFs[k] = { ...v };
      }

      const fileDeltas: FileDelta[] = [];

      // Process tool calls in turn to infer file and env changes
      for (const call of turn.toolCalls) {
        this.processToolCall(call, turnNum, nextFs, currentEnv, fileDeltas);
      }

      // Calculate deltas for any files modified, created, or deleted
      const allPaths = new Set([...Object.keys(previousFs), ...Object.keys(nextFs)]);
      for (const path of allPaths) {
        const prevFile = previousFs[path];
        const nextFile = nextFs[path];

        if (!prevFile && nextFile) {
          if (!fileDeltas.some((d) => d.path === path)) {
            fileDeltas.push({
              path,
              type: "created",
              newHash: nextFile.hash,
              newContent: nextFile.content,
              patchPreview: `+ ${nextFile.content.slice(0, 80)}`,
            });
          }
        } else if (prevFile && !nextFile) {
          if (!fileDeltas.some((d) => d.path === path)) {
            fileDeltas.push({
              path,
              type: "deleted",
              oldHash: prevFile.hash,
              oldContent: prevFile.content,
              patchPreview: `- ${prevFile.content.slice(0, 80)}`,
            });
          }
        } else if (prevFile && nextFile && prevFile.hash !== nextFile.hash) {
          if (!fileDeltas.some((d) => d.path === path)) {
            fileDeltas.push({
              path,
              type: "modified",
              oldHash: prevFile.hash,
              newHash: nextFile.hash,
              oldContent: prevFile.content,
              newContent: nextFile.content,
              patchPreview: `~ ${nextFile.content.slice(0, 80)}`,
            });
          }
        }
      }

      // Update tokens
      cumulativeTokens += 350; // estimate per turn if not tracked

      const turnDuration = 1000;

      const snapshot: TurnSnapshot = {
        turnNumber: turnNum,
        timestamp: new Date().toISOString(),
        virtualFs: nextFs,
        env: { ...currentEnv },
        toolCalls: [...turn.toolCalls],
        cumulativeTokens,
        turnDurationMs: turnDuration,
        fileDeltas,
        metadata: {
          prompt: turn.prompt,
        },
      };

      this.snapshots.set(turnNum, snapshot);
      currentFs = nextFs;
    }
  }

  private processToolCall(
    call: ToolCall,
    turnNum: number,
    fsState: VirtualFSState,
    env: Record<string, string>,
    deltas: FileDelta[]
  ): void {
    const tool = call.toolName.toLowerCase();
    const args = call.arguments || {};

    if (
      tool === "write_file" ||
      tool === "file_write" ||
      tool === "create_file" ||
      tool === "patch_file"
    ) {
      const filePath = (args.path || args.file || args.filepath) as string;
      const content = (args.content || args.text || args.body || "") as string;
      if (filePath) {
        const oldFile = fsState[filePath];
        const newHash = computeContentHash(content);
        const deltaType: FileDeltaType = oldFile ? "modified" : "created";

        fsState[filePath] = {
          path: filePath,
          content,
          hash: newHash,
          size: Buffer.byteLength(content, "utf8"),
          lastModifiedTurn: turnNum,
        };

        deltas.push({
          path: filePath,
          type: deltaType,
          oldHash: oldFile?.hash,
          newHash,
          oldContent: oldFile?.content,
          newContent: content,
          patchPreview: `${deltaType === "created" ? "+" : "~"} ${content.slice(0, 80)}`,
        });
      }
    } else if (tool === "delete_file" || tool === "remove_file" || tool === "file_delete") {
      const filePath = (args.path || args.file) as string;
      if (filePath && fsState[filePath]) {
        const oldFile = fsState[filePath];
        delete fsState[filePath];
        deltas.push({
          path: filePath,
          type: "deleted",
          oldHash: oldFile.hash,
          oldContent: oldFile.content,
          patchPreview: `- ${oldFile.content.slice(0, 80)}`,
        });
      }
    } else if (tool === "bash" || tool === "exec" || tool === "execute_command" || tool === "sh") {
      const cmd = (args.command || args.cmd || "") as string;
      this.parseShellCommandEffects(cmd, turnNum, fsState, env, deltas);
    }
  }

  private parseShellCommandEffects(
    cmd: string,
    turnNum: number,
    fsState: VirtualFSState,
    env: Record<string, string>,
    deltas: FileDelta[]
  ): void {
    if (!cmd) return;

    // Detect export FOO=bar or export FOO="bar"
    const exportMatch = cmd.match(
      /export\s+([A-Za-z_][A-Za-z0-9_]*)=(?:['"]([^'"]*)['"]|([^\s;&|]+))/
    );
    if (exportMatch) {
      env[exportMatch[1]] = exportMatch[2] ?? exportMatch[3] ?? "";
    }

    // Detect echo "content" > file.txt or echo 'content' >> file.txt
    const redirectMatch = cmd.match(/echo\s+['"]([^'"]*)['"]\s*(>>|>)\s*([^\s;&|]+)/);
    if (redirectMatch) {
      const appended = redirectMatch[2] === ">>";
      const rawText = redirectMatch[1];
      const filePath = redirectMatch[3];
      const oldFile = fsState[filePath];

      const content = appended && oldFile ? `${oldFile.content}\n${rawText}` : rawText;
      const newHash = computeContentHash(content);
      const deltaType: FileDeltaType = oldFile ? "modified" : "created";

      fsState[filePath] = {
        path: filePath,
        content,
        hash: newHash,
        size: Buffer.byteLength(content, "utf8"),
        lastModifiedTurn: turnNum,
      };

      deltas.push({
        path: filePath,
        type: deltaType,
        oldHash: oldFile?.hash,
        newHash,
        oldContent: oldFile?.content,
        newContent: content,
        patchPreview: `${deltaType === "created" ? "+" : "~"} ${content.slice(0, 80)}`,
      });
    }

    // Detect rm -f file.txt
    const rmMatch = cmd.match(/rm\s+(?:-[rf]+\s+)?([^\s;&|]+)/);
    if (rmMatch) {
      const filePath = rmMatch[1];
      if (fsState[filePath]) {
        const oldFile = fsState[filePath];
        delete fsState[filePath];
        deltas.push({
          path: filePath,
          type: "deleted",
          oldHash: oldFile.hash,
          oldContent: oldFile.content,
          patchPreview: `- ${oldFile.content.slice(0, 80)}`,
        });
      }
    }
  }

  public getSnapshot(turnNumber: number): TurnSnapshot | undefined {
    return this.snapshots.get(turnNumber);
  }

  public getAllSnapshots(): TurnSnapshot[] {
    return Array.from(this.snapshots.values()).sort((a, b) => a.turnNumber - b.turnNumber);
  }

  public restoreTurn(turnNumber: number): { virtualFs: VirtualFSState; env: Record<string, string> } {
    const snap = this.getSnapshot(turnNumber);
    if (!snap) {
      throw new Error(`TurnSnapshot for turn ${turnNumber} not found.`);
    }

    // Return deep clone
    const restoredFs: VirtualFSState = {};
    for (const [p, f] of Object.entries(snap.virtualFs)) {
      restoredFs[p] = { ...f };
    }

    return {
      virtualFs: restoredFs,
      env: { ...snap.env },
    };
  }

  public diffTurns(turnA: number, turnB: number): FileDelta[] {
    const snapA = this.getSnapshot(turnA);
    const snapB = this.getSnapshot(turnB);

    if (!snapA || !snapB) {
      throw new Error(`Invalid turn numbers for diff: ${turnA}, ${turnB}`);
    }

    const fsA = snapA.virtualFs;
    const fsB = snapB.virtualFs;
    const allPaths = new Set([...Object.keys(fsA), ...Object.keys(fsB)]);
    const deltas: FileDelta[] = [];

    for (const p of allPaths) {
      const fileA = fsA[p];
      const fileB = fsB[p];

      if (!fileA && fileB) {
        deltas.push({
          path: p,
          type: "created",
          newHash: fileB.hash,
          newContent: fileB.content,
          patchPreview: `+ ${fileB.content.slice(0, 80)}`,
        });
      } else if (fileA && !fileB) {
        deltas.push({
          path: p,
          type: "deleted",
          oldHash: fileA.hash,
          oldContent: fileA.content,
          patchPreview: `- ${fileA.content.slice(0, 80)}`,
        });
      } else if (fileA && fileB && fileA.hash !== fileB.hash) {
        deltas.push({
          path: p,
          type: "modified",
          oldHash: fileA.hash,
          newHash: fileB.hash,
          oldContent: fileA.content,
          newContent: fileB.content,
          patchPreview: `~ ${fileB.content.slice(0, 80)}`,
        });
      }
    }

    return deltas;
  }
}

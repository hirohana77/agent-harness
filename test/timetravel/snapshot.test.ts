import { describe, expect, it } from "vitest";
import { Trajectory } from "../../src/core/types.js";
import { SnapshotManager, computeContentHash } from "../../src/timetravel/snapshot.js";

describe("SnapshotManager", () => {
  const sampleTrajectory: Trajectory = {
    scenarioId: "snapshot-test-scenario",
    startedAt: "2026-10-24T03:00:00.000Z",
    status: "completed",
    summary: {
      totalTurns: 3,
      totalToolCalls: 4,
      totalTokens: 1200,
      costUsd: 0.02,
      completed: true,
    },
    turns: [
      {
        turnNumber: 1,
        prompt: "Create source file",
        toolCalls: [
          {
            callId: "call-1",
            toolName: "write_file",
            arguments: { path: "src/main.ts", content: "console.log('init');" },
            result: { success: true, exitCode: 0, output: "Wrote 20 bytes" },
          },
        ],
      },
      {
        turnNumber: 2,
        prompt: "Update source file and export variable",
        toolCalls: [
          {
            callId: "call-2",
            toolName: "file_write",
            arguments: { path: "src/main.ts", content: "console.log('updated');" },
            result: { success: true, exitCode: 0 },
          },
          {
            callId: "call-3",
            toolName: "bash",
            arguments: { command: "export APP_ENV=production && echo 'hello' > greeting.txt" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
      {
        turnNumber: 3,
        prompt: "Delete greeting file",
        toolCalls: [
          {
            callId: "call-4",
            toolName: "delete_file",
            arguments: { path: "greeting.txt" },
            result: { success: true, exitCode: 0 },
          },
        ],
      },
    ],
  };

  it("computes content hashes deterministically", () => {
    const hash1 = computeContentHash("sample content");
    const hash2 = computeContentHash("sample content");
    const hash3 = computeContentHash("different content");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(16);
  });

  it("tracks virtual filesystem snapshots across all turns", () => {
    const manager = new SnapshotManager(sampleTrajectory, {
      initialFiles: { "README.md": "# Readme" },
      initialEnv: { NODE_ENV: "test" },
    });

    const snapshots = manager.getAllSnapshots();
    expect(snapshots.length).toBe(3);

    // Turn 1
    const snap1 = manager.getSnapshot(1)!;
    expect(snap1.virtualFs["README.md"]).toBeDefined();
    expect(snap1.virtualFs["src/main.ts"]).toBeDefined();
    expect(snap1.virtualFs["src/main.ts"].content).toBe("console.log('init');");
    expect(snap1.fileDeltas.some((d) => d.path === "src/main.ts" && d.type === "created")).toBe(true);

    // Turn 2
    const snap2 = manager.getSnapshot(2)!;
    expect(snap2.virtualFs["src/main.ts"].content).toBe("console.log('updated');");
    expect(snap2.virtualFs["greeting.txt"]).toBeDefined();
    expect(snap2.env.APP_ENV).toBe("production");
    expect(snap2.env.NODE_ENV).toBe("test");
    expect(snap2.fileDeltas.some((d) => d.path === "src/main.ts" && d.type === "modified")).toBe(true);
    expect(snap2.fileDeltas.some((d) => d.path === "greeting.txt" && d.type === "created")).toBe(true);

    // Turn 3
    const snap3 = manager.getSnapshot(3)!;
    expect(snap3.virtualFs["greeting.txt"]).toBeUndefined();
    expect(snap3.fileDeltas.some((d) => d.path === "greeting.txt" && d.type === "deleted")).toBe(true);
  });

  it("restores turn state as a deep clone", () => {
    const manager = new SnapshotManager(sampleTrajectory);
    const restored = manager.restoreTurn(2);

    expect(restored.virtualFs["src/main.ts"].content).toBe("console.log('updated');");
    restored.virtualFs["src/main.ts"].content = "tampered";

    const snap2Again = manager.getSnapshot(2)!;
    expect(snap2Again.virtualFs["src/main.ts"].content).toBe("console.log('updated');");
  });

  it("computes diff between arbitrary turns", () => {
    const manager = new SnapshotManager(sampleTrajectory);
    const diff = manager.diffTurns(1, 3);

    // Turn 1 to 3: src/main.ts was modified, greeting.txt was created then deleted (so no delta or unchanged relative to 1)
    const mainDelta = diff.find((d) => d.path === "src/main.ts");
    expect(mainDelta).toBeDefined();
    expect(mainDelta?.type).toBe("modified");
  });

  it("throws when restoring an invalid turn number", () => {
    const manager = new SnapshotManager(sampleTrajectory);
    expect(() => manager.restoreTurn(999)).toThrow("TurnSnapshot for turn 999 not found.");
  });
});

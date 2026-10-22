import { describe, expect, it } from "vitest";
import { ReflexionEpisodeDetector } from "../../src/reflexion/detector.js";
import { Trajectory } from "../../src/core/types.js";

describe("ReflexionEpisodeDetector", () => {
  const detector = new ReflexionEpisodeDetector();

  it("classifies diverse error classes correctly", () => {
    expect(
      detector.classifyError({
        callId: "1",
        toolName: "bash",
        arguments: { command: "cat secret.txt" },
        result: { success: false, output: "cat: secret.txt: Permission denied", exitCode: 1 },
      })
    ).toBe("permission-denied");

    expect(
      detector.classifyError({
        callId: "2",
        toolName: "bash",
        arguments: { command: "node missing.js" },
        result: { success: false, output: "Error: ENOENT: no such file or directory, open 'missing.js'", exitCode: 1 },
      })
    ).toBe("file-not-found");

    expect(
      detector.classifyError({
        callId: "3",
        toolName: "bash",
        arguments: { command: "node broken.js" },
        result: { success: false, output: "SyntaxError: Unexpected token '{'", exitCode: 1 },
      })
    ).toBe("syntax-ast-error");

    expect(
      detector.classifyError({
        callId: "4",
        toolName: "bash",
        arguments: { command: "npm test" },
        result: { success: false, output: "FAIL test/index.test.js\nAssertionError: expected false to be true", exitCode: 1 },
      })
    ).toBe("test-regression");

    expect(
      detector.classifyError({
        callId: "5",
        toolName: "teleport_spaceship",
        arguments: {},
        result: { success: false, error: "unknown tool: teleport_spaceship is not registered" },
      })
    ).toBe("hallucinated-tool");

    expect(
      detector.classifyError({
        callId: "6",
        toolName: "bash",
        arguments: { command: "exit 2" },
        result: { success: false, exitCode: 2 },
      })
    ).toBe("command-failure");
  });

  it("detects an episode and tracks recovery with code-patch-rework strategy", () => {
    const trajectory: Trajectory = {
      scenarioId: "fix-bug-task",
      startedAt: new Date().toISOString(),
      durationMs: 3500,
      status: "completed",
      summary: { totalTurns: 3, totalToolCalls: 3, totalTokens: 1200, costUsd: 0.01, completed: true },
      turns: [
        {
          turnNumber: 1,
          prompt: "Run tests",
          toolCalls: [
            {
              callId: "c1",
              toolName: "bash",
              arguments: { command: "npm test" },
              result: { success: false, exitCode: 1, output: "FAIL test/math.test.ts" },
            },
          ],
        },
        {
          turnNumber: 2,
          prompt: "Fix the bug in src/math.ts",
          toolCalls: [
            {
              callId: "c2",
              toolName: "file_write",
              arguments: { path: "src/math.ts", content: "export const add = (a, b) => a + b;" },
              result: { success: true, output: "File updated" },
            },
          ],
        },
        {
          turnNumber: 3,
          prompt: "Re-run tests",
          toolCalls: [
            {
              callId: "c3",
              toolName: "bash",
              arguments: { command: "npm test" },
              result: { success: true, exitCode: 0, output: "PASS test/math.test.ts" },
            },
          ],
        },
      ],
    };

    const episodes = detector.detectEpisodes(trajectory);
    expect(episodes.length).toBe(1);

    const ep = episodes[0];
    expect(ep.errorClass).toBe("test-regression");
    expect(ep.triggerTurn).toBe(1);
    expect(ep.status).toBe("recovered");
    expect(ep.recoveryTurn).toBe(3);
    expect(ep.turnSpan).toBe(3);
    expect(ep.strategy).toBe("code-patch-rework");
    expect(ep.resolutionProof).toContain("PASS");
  });

  it("detects recovery with rollback-and-restart strategy when git restore is used", () => {
    const trajectory: Trajectory = {
      scenarioId: "git-revert-task",
      startedAt: new Date().toISOString(),
      durationMs: 2000,
      status: "completed",
      summary: { totalTurns: 2, totalToolCalls: 2, totalTokens: 800, costUsd: 0.005, completed: true },
      turns: [
        {
          turnNumber: 1,
          prompt: "Check build",
          toolCalls: [
            {
              callId: "c1",
              toolName: "bash",
              arguments: { command: "npm run build" },
              result: { success: false, exitCode: 1, error: "Build failed due to corrupted index.ts" },
            },
          ],
        },
        {
          turnNumber: 2,
          prompt: "Revert index.ts and rebuild",
          toolCalls: [
            {
              callId: "c2",
              toolName: "bash",
              arguments: { command: "git restore src/index.ts" },
              result: { success: true, exitCode: 0 },
            },
            {
              callId: "c3",
              toolName: "bash",
              arguments: { command: "npm run build" },
              result: { success: true, exitCode: 0, output: "Build successful" },
            },
          ],
        },
      ],
    };

    const episodes = detector.detectEpisodes(trajectory);
    expect(episodes.length).toBe(1);
    expect(episodes[0].status).toBe("recovered");
    expect(episodes[0].strategy).toBe("rollback-and-restart");
  });

  it("marks episode as thrashing when retries exceed threshold", () => {
    const trajectory: Trajectory = {
      scenarioId: "stuck-task",
      startedAt: new Date().toISOString(),
      durationMs: 5000,
      status: "error",
      summary: { totalTurns: 4, totalToolCalls: 4, totalTokens: 1500, costUsd: 0.015, completed: false },
      turns: [
        {
          turnNumber: 1,
          prompt: "Compile",
          toolCalls: [
            {
              callId: "c1",
              toolName: "bash",
              arguments: { command: "make" },
              result: { success: false, exitCode: 2, output: "make: *** [all] Error 2" },
            },
          ],
        },
        {
          turnNumber: 2,
          prompt: "Retry compile",
          toolCalls: [
            {
              callId: "c2",
              toolName: "bash",
              arguments: { command: "make" },
              result: { success: false, exitCode: 2, output: "make: *** [all] Error 2" },
            },
          ],
        },
        {
          turnNumber: 3,
          prompt: "Retry compile again",
          toolCalls: [
            {
              callId: "c3",
              toolName: "bash",
              arguments: { command: "make" },
              result: { success: false, exitCode: 2, output: "make: *** [all] Error 2" },
            },
          ],
        },
        {
          turnNumber: 4,
          prompt: "Retry compile 4th time",
          toolCalls: [
            {
              callId: "c4",
              toolName: "bash",
              arguments: { command: "make" },
              result: { success: false, exitCode: 2, output: "make: *** [all] Error 2" },
            },
          ],
        },
      ],
    };

    const customDetector = new ReflexionEpisodeDetector({ maxThrashingThreshold: 2 });
    const episodes = customDetector.detectEpisodes(trajectory);
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0].status).toBe("thrashing");
  });
});

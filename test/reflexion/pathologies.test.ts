import { describe, expect, it } from "vitest";
import { PathologyDetector } from "../../src/reflexion/pathologies.js";
import { Trajectory } from "../../src/core/types.js";
import { FailureEpisode } from "../../src/reflexion/types.js";

describe("PathologyDetector", () => {
  const detector = new PathologyDetector();

  it("detects repetitive-thrashing pathology when tool is repeatedly called with same failing args", () => {
    const trajectory: Trajectory = {
      scenarioId: "thrash-task",
      startedAt: new Date().toISOString(),
      durationMs: 4000,
      status: "error",
      summary: { totalTurns: 4, totalToolCalls: 4, totalTokens: 1000, costUsd: 0.01, completed: false },
      turns: [
        {
          turnNumber: 1,
          prompt: "run command",
          toolCalls: [
            { callId: "1", toolName: "bash", arguments: { command: "curl -s http://bad.host" }, result: { success: false, exitCode: 7 } },
          ],
        },
        {
          turnNumber: 2,
          prompt: "run command again",
          toolCalls: [
            { callId: "2", toolName: "bash", arguments: { command: "curl -s http://bad.host" }, result: { success: false, exitCode: 7 } },
          ],
        },
        {
          turnNumber: 3,
          prompt: "run command 3rd time",
          toolCalls: [
            { callId: "3", toolName: "bash", arguments: { command: "curl -s http://bad.host" }, result: { success: false, exitCode: 7 } },
          ],
        },
      ],
    };

    const findings = detector.detectPathologies(trajectory);
    const thrashing = findings.find((f) => f.type === "repetitive-thrashing");
    expect(thrashing).toBeDefined();
    expect(thrashing?.turnRange).toEqual([1, 3]);
  });

  it("detects blind-retry pathology when failing command is re-run without state modification", () => {
    const trajectory: Trajectory = {
      scenarioId: "blind-retry-task",
      startedAt: new Date().toISOString(),
      durationMs: 3000,
      status: "error",
      summary: { totalTurns: 2, totalToolCalls: 2, totalTokens: 800, costUsd: 0.005, completed: false },
      turns: [
        {
          turnNumber: 1,
          prompt: "test",
          toolCalls: [
            { callId: "1", toolName: "bash", arguments: { command: "pytest tests/" }, result: { success: false, exitCode: 1 } },
          ],
        },
        {
          turnNumber: 2,
          prompt: "test again without changing files",
          toolCalls: [
            { callId: "2", toolName: "bash", arguments: { command: "pytest tests/" }, result: { success: false, exitCode: 1 } },
          ],
        },
      ],
    };

    const findings = detector.detectPathologies(trajectory);
    const blindRetry = findings.find((f) => f.type === "blind-retry");
    expect(blindRetry).toBeDefined();
    expect(blindRetry?.turnRange).toEqual([1, 2]);
  });

  it("detects error-ignorance pathology when agent claims success despite error", () => {
    const trajectory: Trajectory = {
      scenarioId: "ignore-task",
      startedAt: new Date().toISOString(),
      durationMs: 2000,
      status: "completed",
      summary: { totalTurns: 1, totalToolCalls: 1, totalTokens: 500, costUsd: 0.003, completed: true },
      turns: [
        {
          turnNumber: 1,
          prompt: "run build",
          toolCalls: [
            { callId: "1", toolName: "bash", arguments: { command: "npm run build" }, result: { success: false, exitCode: 1, error: "TS2304: Cannot find name 'foo'" } },
          ],
          assistantMessage: "All tests passed and task completed successfully!",
        },
      ],
    };

    const findings = detector.detectPathologies(trajectory);
    const ignorance = findings.find((f) => f.type === "error-ignorance");
    expect(ignorance).toBeDefined();
    expect(ignorance?.severity).toBe("high");
  });

  it("detects oscillation pathology when agent alternates between two commands", () => {
    const trajectory: Trajectory = {
      scenarioId: "oscillate-task",
      startedAt: new Date().toISOString(),
      durationMs: 4000,
      status: "running",
      summary: { totalTurns: 4, totalToolCalls: 4, totalTokens: 1000, costUsd: 0.01, completed: false },
      turns: [
        { turnNumber: 1, prompt: "toggle flag A", toolCalls: [{ callId: "1", toolName: "bash", arguments: { command: "cfg --mode=fast" }, result: { success: true } }] },
        { turnNumber: 2, prompt: "toggle flag B", toolCalls: [{ callId: "2", toolName: "bash", arguments: { command: "cfg --mode=safe" }, result: { success: true } }] },
        { turnNumber: 3, prompt: "toggle flag A again", toolCalls: [{ callId: "3", toolName: "bash", arguments: { command: "cfg --mode=fast" }, result: { success: true } }] },
        { turnNumber: 4, prompt: "toggle flag B again", toolCalls: [{ callId: "4", toolName: "bash", arguments: { command: "cfg --mode=safe" }, result: { success: true } }] },
      ],
    };

    const findings = detector.detectPathologies(trajectory);
    const oscillation = findings.find((f) => f.type === "oscillation");
    expect(oscillation).toBeDefined();
    expect(oscillation?.turnRange).toEqual([1, 4]);
  });

  it("detects cascading-regression across consecutive failure episodes", () => {
    const episodes: FailureEpisode[] = [
      {
        id: "ep-1",
        errorClass: "test-regression",
        triggerTurn: 1,
        triggerToolName: "bash",
        errorMessage: "assertion error",
        status: "exhausted",
        turnSpan: 2,
        detectedPathologies: [],
      },
      {
        id: "ep-2",
        errorClass: "syntax-ast-error",
        triggerTurn: 2,
        triggerToolName: "bash",
        errorMessage: "SyntaxError",
        status: "exhausted",
        turnSpan: 1,
        detectedPathologies: [],
      },
    ];

    const trajectory: Trajectory = {
      scenarioId: "cascade-task",
      startedAt: new Date().toISOString(),
      durationMs: 2000,
      status: "error",
      summary: { totalTurns: 2, totalToolCalls: 2, totalTokens: 600, costUsd: 0.005, completed: false },
      turns: [],
    };

    const findings = detector.detectPathologies(trajectory, episodes);
    const cascade = findings.find((f) => f.type === "cascading-regression");
    expect(cascade).toBeDefined();
    expect(cascade?.turnRange).toEqual([1, 2]);
  });
});

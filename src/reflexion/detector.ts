import { Trajectory, AgentTurn, ToolCall } from "../core/types.js";
import {
  FailureEpisode,
  ReflexionErrorClass,
  ReflexionEpisodeStatus,
  ReflexionRecoveryStrategy,
  ReflexionAnalysisOptions,
} from "./types.js";

const TEST_COMMAND_INDICATORS = [
  "test",
  "pytest",
  "vitest",
  "jest",
  "cargo test",
  "go test",
  "mvn test",
  "npm run test",
  "pnpm test",
  "yarn test",
];

export class ReflexionEpisodeDetector {
  private options: Required<ReflexionAnalysisOptions>;

  constructor(options?: ReflexionAnalysisOptions) {
    this.options = {
      maxThrashingThreshold: options?.maxThrashingThreshold ?? 3,
      detectPathologies: options?.detectPathologies ?? true,
      testCommandPatterns: options?.testCommandPatterns ?? TEST_COMMAND_INDICATORS,
      format: options?.format ?? "terminal",
    };
  }

  public detectEpisodes(trajectory: Trajectory): FailureEpisode[] {
    const episodes: FailureEpisode[] = [];
    const turns = trajectory.turns || [];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const toolCalls = turn.toolCalls || [];

      for (let c = 0; c < toolCalls.length; c++) {
        const call = toolCalls[c];
        if (this.isErrorCall(call)) {
          const errorClass = this.classifyError(call);
          const episodeId = `ep-${turn.turnNumber}-${c + 1}`;

          const episode = this.trackEpisodeLifecycle(
            episodeId,
            errorClass,
            turn.turnNumber,
            call,
            turns,
            i
          );

          episodes.push(episode);
        }
      }
    }

    return episodes;
  }

  private isErrorCall(call: ToolCall): boolean {
    if (!call.result) return false;
    if (call.result.success === false) return true;
    if (typeof call.result.exitCode === "number" && call.result.exitCode !== 0) return true;
    if (call.result.error && call.result.error.trim().length > 0) return true;

    // Check common error keywords in output
    const output = (call.result.output || "").toLowerCase();
    if (
      output.includes("command not found") ||
      output.includes("syntaxerror:") ||
      output.includes("cannot find module") ||
      output.includes("assertionerror") ||
      output.includes("permission denied")
    ) {
      return true;
    }

    return false;
  }

  public classifyError(call: ToolCall): ReflexionErrorClass {
    const errorText = [
      call.result?.error || "",
      call.result?.output || "",
      call.toolName || "",
      typeof call.arguments?.command === "string" ? call.arguments.command : "",
    ]
      .join(" ")
      .toLowerCase();

    if (
      errorText.includes("permission denied") ||
      errorText.includes("eacces") ||
      errorText.includes("operation not permitted")
    ) {
      return "permission-denied";
    }

    if (
      errorText.includes("no such file") ||
      errorText.includes("enoent") ||
      errorText.includes("file not found") ||
      errorText.includes("directory not found")
    ) {
      return "file-not-found";
    }

    if (
      errorText.includes("syntaxerror") ||
      errorText.includes("parse error") ||
      errorText.includes("compilation error") ||
      errorText.includes("unexpected token") ||
      errorText.includes("typeerror") ||
      errorText.includes("ts(")
    ) {
      return "syntax-ast-error";
    }

    const isTestCommand =
      this.options.testCommandPatterns.some((pattern) => errorText.includes(pattern.toLowerCase())) ||
      errorText.includes("failing") ||
      errorText.includes("test failed") ||
      errorText.includes("assertionerror");

    if (isTestCommand) {
      return "test-regression";
    }

    if (
      errorText.includes("unknown tool") ||
      errorText.includes("tool not found") ||
      errorText.includes("hallucinated")
    ) {
      return "hallucinated-tool";
    }

    if (
      call.toolName.toLowerCase().includes("bash") ||
      call.toolName.toLowerCase().includes("exec") ||
      call.toolName.toLowerCase().includes("command") ||
      typeof call.result?.exitCode === "number"
    ) {
      return "command-failure";
    }

    return "tool-error";
  }

  private trackEpisodeLifecycle(
    episodeId: string,
    errorClass: ReflexionErrorClass,
    triggerTurn: number,
    triggerCall: ToolCall,
    turns: AgentTurn[],
    startIndex: number
  ): FailureEpisode {
    const errorMessage =
      triggerCall.result?.error ||
      triggerCall.result?.output?.slice(0, 300) ||
      `Execution failed with exit code ${triggerCall.result?.exitCode ?? 1}`;

    let status: ReflexionEpisodeStatus = "exhausted";
    let recoveryTurn: number | undefined;
    let strategy: ReflexionRecoveryStrategy | undefined;
    let resolutionProof: string | undefined;

    let retryCount = 0;
    const triggerCommand = this.extractCommand(triggerCall);

    for (let j = startIndex + 1; j < turns.length; j++) {
      const turn = turns[j];
      const toolCalls = turn.toolCalls || [];

      for (const call of toolCalls) {
        const cmd = this.extractCommand(call);
        const isSameTool = call.toolName === triggerCall.toolName;
        const isSameCommand = triggerCommand && cmd && triggerCommand === cmd;

        if (isSameCommand || isSameTool) {
          if (call.result && call.result.success !== false && (call.result.exitCode === 0 || call.result.exitCode === undefined)) {
            // Error resolved!
            status = "recovered";
            recoveryTurn = turn.turnNumber;
            resolutionProof = call.result.output?.slice(0, 200) || `Tool ${call.toolName} completed successfully.`;
            strategy = this.inferStrategy(turns.slice(startIndex, j + 1), triggerCall, call);
            break;
          } else {
            retryCount++;
            if (retryCount >= this.options.maxThrashingThreshold) {
              status = "thrashing";
            }
          }
        }
      }

      if (status === "recovered") {
        break;
      }
    }

    // Check if abandoned
    if (status === "exhausted" && turns.length - startIndex > 3) {
      status = "abandoned";
    }

    const endTurn = recoveryTurn ?? turns[turns.length - 1]?.turnNumber ?? triggerTurn;
    const turnSpan = Math.max(1, endTurn - triggerTurn + 1);

    return {
      id: episodeId,
      errorClass,
      triggerTurn,
      triggerToolCallId: triggerCall.callId,
      triggerToolName: triggerCall.toolName,
      errorMessage: errorMessage.trim(),
      exitCode: triggerCall.result?.exitCode,
      status,
      recoveryTurn,
      turnSpan,
      detectedPathologies: [],
      strategy,
      evidence: `Triggered at Turn ${triggerTurn} via ${triggerCall.toolName}`,
      resolutionProof,
    };
  }

  private extractCommand(call: ToolCall): string | undefined {
    if (typeof call.arguments?.command === "string") {
      return call.arguments.command.trim();
    }
    if (typeof call.arguments?.cmd === "string") {
      return call.arguments.cmd.trim();
    }
    return undefined;
  }

  private inferStrategy(
    turnsBetween: AgentTurn[],
    triggerCall: ToolCall,
    resolvedCall: ToolCall
  ): ReflexionRecoveryStrategy {
    let hasFileEdit = false;
    let hasInvestigation = false;
    let hasGitRollback = false;
    let hasCleanup = false;

    for (const turn of turnsBetween) {
      for (const call of turn.toolCalls || []) {
        const name = call.toolName.toLowerCase();
        const cmd = (typeof call.arguments?.command === "string" ? call.arguments.command : "").toLowerCase();

        if (
          name.includes("file_write") ||
          name.includes("write_file") ||
          name.includes("edit") ||
          name.includes("str_replace") ||
          cmd.includes("sed ") ||
          cmd.includes("echo ") && cmd.includes(">")
        ) {
          hasFileEdit = true;
        }

        if (
          cmd.includes("git checkout") ||
          cmd.includes("git restore") ||
          cmd.includes("git reset")
        ) {
          hasGitRollback = true;
        }

        if (
          cmd.includes("rm -rf node_modules") ||
          cmd.includes("clean") ||
          cmd.includes("cache clean") ||
          cmd.includes("rm -rf dist")
        ) {
          hasCleanup = true;
        }

        if (
          name.includes("cat") ||
          name.includes("read") ||
          cmd.startsWith("cat ") ||
          cmd.startsWith("ls ") ||
          cmd.startsWith("find ") ||
          cmd.startsWith("grep ")
        ) {
          hasInvestigation = true;
        }
      }
    }

    if (hasGitRollback) return "rollback-and-restart";
    if (hasCleanup) return "workspace-cleanup";
    if (hasFileEdit) return "code-patch-rework";
    if (hasInvestigation) return "multi-step-investigation";

    if (triggerCall.toolName !== resolvedCall.toolName) {
      return "alternative-tool";
    }

    return "parameter-adjustment";
  }
}

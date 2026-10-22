import { Trajectory, AgentTurn, ToolCall } from "../core/types.js";
import {
  PathologyFinding,
  ReflexionPathologyType,
  FailureEpisode,
} from "./types.js";

export class PathologyDetector {
  public detectPathologies(
    trajectory: Trajectory,
    episodes: FailureEpisode[] = []
  ): PathologyFinding[] {
    const findings: PathologyFinding[] = [];
    const turns = trajectory.turns || [];

    findings.push(...this.detectRepetitiveThrashing(turns));
    findings.push(...this.detectBlindRetry(turns));
    findings.push(...this.detectErrorIgnorance(turns));
    findings.push(...this.detectOscillation(turns));
    findings.push(...this.detectCascadingRegressions(episodes));

    // Link detected pathologies back to failure episodes
    for (const finding of findings) {
      for (const ep of episodes) {
        if (
          finding.turnRange[0] >= ep.triggerTurn &&
          finding.turnRange[0] <= (ep.recoveryTurn ?? ep.triggerTurn + ep.turnSpan)
        ) {
          finding.episodeId = ep.id;
          if (!ep.detectedPathologies.includes(finding.type)) {
            ep.detectedPathologies.push(finding.type);
          }
        }
      }
    }

    return findings;
  }

  private detectRepetitiveThrashing(turns: AgentTurn[]): PathologyFinding[] {
    const findings: PathologyFinding[] = [];
    let repeatCount = 1;
    let prevSig = "";
    let startTurn = 1;

    for (const turn of turns) {
      for (const call of turn.toolCalls || []) {
        const isFailed =
          call.result?.success === false ||
          (typeof call.result?.exitCode === "number" && call.result.exitCode !== 0) ||
          !!call.result?.error;

        const sig = `${call.toolName}:${JSON.stringify(call.arguments || {})}`;

        if (isFailed && sig === prevSig) {
          repeatCount++;
          if (repeatCount >= 3) {
            findings.push({
              id: `pathology-thrashing-${startTurn}-${turn.turnNumber}`,
              type: "repetitive-thrashing",
              turnRange: [startTurn, turn.turnNumber],
              severity: repeatCount >= 5 ? "high" : "medium",
              description: `Agent repeatedly executed failing tool '${call.toolName}' ${repeatCount} times without variation.`,
              evidence: `Signature: ${call.toolName} with identical arguments across turns ${startTurn} to ${turn.turnNumber}`,
              suggestedRemediation:
                "Inject verbal reflection prompt or apply early-break circuit breaker to prevent infinite tool loops.",
            });
            repeatCount = 1; // reset after recording
          }
        } else {
          repeatCount = 1;
          prevSig = isFailed ? sig : "";
          startTurn = turn.turnNumber;
        }
      }
    }

    return findings;
  }

  private detectBlindRetry(turns: AgentTurn[]): PathologyFinding[] {
    const findings: PathologyFinding[] = [];
    let lastFailedCommand: { cmd: string; turn: number } | null = null;
    let hasModifiedState = false;

    for (const turn of turns) {
      for (const call of turn.toolCalls || []) {
        const cmd = this.getCommandString(call);
        const isFailed =
          call.result?.success === false ||
          (typeof call.result?.exitCode === "number" && call.result.exitCode !== 0);

        const isModifierTool =
          call.toolName.toLowerCase().includes("write") ||
          call.toolName.toLowerCase().includes("edit") ||
          (cmd && (cmd.includes(">") || cmd.includes("sed ") || cmd.includes("patch ")));

        if (isModifierTool) {
          hasModifiedState = true;
        }

        if (cmd && isFailed) {
          if (
            lastFailedCommand &&
            lastFailedCommand.cmd === cmd &&
            !hasModifiedState &&
            turn.turnNumber > lastFailedCommand.turn
          ) {
            findings.push({
              id: `pathology-blind-retry-${lastFailedCommand.turn}-${turn.turnNumber}`,
              type: "blind-retry",
              turnRange: [lastFailedCommand.turn, turn.turnNumber],
              severity: "medium",
              description: `Agent executed command '${cmd}' again without modifying any workspace files or environment between failures.`,
              evidence: `Failed at turn ${lastFailedCommand.turn}, blindly retried at turn ${turn.turnNumber}`,
              suggestedRemediation:
                "Instruct agent to inspect error causes and modify implementation files before re-running test commands.",
            });
          }
          lastFailedCommand = { cmd, turn: turn.turnNumber };
          hasModifiedState = false;
        } else if (cmd && !isFailed) {
          lastFailedCommand = null;
          hasModifiedState = false;
        }
      }
    }

    return findings;
  }

  private detectErrorIgnorance(turns: AgentTurn[]): PathologyFinding[] {
    const findings: PathologyFinding[] = [];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const failedCalls = (turn.toolCalls || []).filter(
        (c) =>
          c.result?.success === false ||
          (typeof c.result?.exitCode === "number" && c.result.exitCode !== 0) ||
          !!c.result?.error
      );

      if (failedCalls.length > 0 && turn.assistantMessage) {
        const msg = turn.assistantMessage.toLowerCase();
        const claimsSuccess =
          msg.includes("all tests passed") ||
          msg.includes("task completed successfully") ||
          msg.includes("everything is working") ||
          msg.includes("no errors found") ||
          msg.includes("fixed successfully");

        if (claimsSuccess) {
          findings.push({
            id: `pathology-ignorance-${turn.turnNumber}`,
            type: "error-ignorance",
            turnRange: [turn.turnNumber, turn.turnNumber],
            severity: "high",
            description: `Agent claimed full success in assistant message despite tool execution encountering errors.`,
            evidence: `Tool '${failedCalls[0].toolName}' failed with exitCode ${failedCalls[0].result?.exitCode ?? 1}, but agent claimed: "${turn.assistantMessage.slice(0, 100)}..."`,
            suggestedRemediation:
              "Enforce output sanity check guardrail to cross-verify tool exit codes before accepting agent completion declarations.",
          });
        }
      }
    }

    return findings;
  }

  private detectOscillation(turns: AgentTurn[]): PathologyFinding[] {
    const findings: PathologyFinding[] = [];
    const commandHistory: Array<{ cmd: string; turn: number }> = [];

    for (const turn of turns) {
      for (const call of turn.toolCalls || []) {
        const cmd = this.getCommandString(call);
        if (cmd) {
          commandHistory.push({ cmd, turn: turn.turnNumber });
        }
      }
    }

    // Look for alternating pattern A -> B -> A -> B
    for (let i = 0; i <= commandHistory.length - 4; i++) {
      const a1 = commandHistory[i].cmd;
      const b1 = commandHistory[i + 1].cmd;
      const a2 = commandHistory[i + 2].cmd;
      const b2 = commandHistory[i + 3].cmd;

      if (a1 === a2 && b1 === b2 && a1 !== b1) {
        findings.push({
          id: `pathology-oscillation-${commandHistory[i].turn}-${commandHistory[i + 3].turn}`,
          type: "oscillation",
          turnRange: [commandHistory[i].turn, commandHistory[i + 3].turn],
          severity: "high",
          description: `Agent exhibited oscillating thrashing behavior between two conflicting actions: '${a1}' and '${b1}'.`,
          evidence: `Oscillation pattern A-B-A-B detected across turns ${commandHistory[i].turn} to ${commandHistory[i + 3].turn}`,
          suggestedRemediation:
            "Provide explicit historical context or reflection guidance preventing the agent from cycling between previous unsuccessful states.",
        });
        i += 3; // skip past this sequence
      }
    }

    return findings;
  }

  private detectCascadingRegressions(episodes: FailureEpisode[]): PathologyFinding[] {
    const findings: PathologyFinding[] = [];

    for (let i = 0; i < episodes.length - 1; i++) {
      const ep1 = episodes[i];
      const ep2 = episodes[i + 1];

      // If a second error of different class happens right within or immediately after first episode's turn span
      if (
        ep2.triggerTurn > ep1.triggerTurn &&
        ep2.triggerTurn <= ep1.triggerTurn + ep1.turnSpan + 1 &&
        ep2.errorClass !== ep1.errorClass &&
        ep1.status !== "recovered"
      ) {
        findings.push({
          id: `pathology-regression-${ep1.triggerTurn}-${ep2.triggerTurn}`,
          type: "cascading-regression",
          turnRange: [ep1.triggerTurn, ep2.triggerTurn],
          severity: "medium",
          description: `Attempted resolution of '${ep1.errorClass}' cascaded into a secondary failure of type '${ep2.errorClass}'.`,
          evidence: `Episode ${ep1.id} (${ep1.errorClass}) triggered secondary Episode ${ep2.id} (${ep2.errorClass}) at turn ${ep2.triggerTurn}`,
          suggestedRemediation:
            "Encourage agent to isolate test runs or perform dry-run syntax checks before full integration re-executions.",
        });
      }
    }

    return findings;
  }

  private getCommandString(call: ToolCall): string | null {
    if (typeof call.arguments?.command === "string") return call.arguments.command.trim();
    if (typeof call.arguments?.cmd === "string") return call.arguments.cmd.trim();
    return null;
  }
}

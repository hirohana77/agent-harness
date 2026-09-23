import { Trajectory, TrajectoryAssertion, AssertionItemResult } from "../core/types.js";

export class TrajectoryVerifier {
  private defaultTrajectory?: Trajectory;

  constructor(defaultTrajectory?: Trajectory) {
    this.defaultTrajectory = defaultTrajectory;
  }

  public verifyOne(assertion: TrajectoryAssertion, trajectory?: Trajectory): AssertionItemResult {
    const targetTrajectory = trajectory || this.defaultTrajectory;
    if (!targetTrajectory) {
      throw new Error("No trajectory provided to verify");
    }
    const results = this.verify([assertion], targetTrajectory);
    return results[0];
  }

  public verify(assertions: TrajectoryAssertion[], trajectory?: Trajectory): AssertionItemResult[] {
    const targetTrajectory = trajectory || this.defaultTrajectory;
    if (!targetTrajectory) {
      throw new Error("No trajectory provided to verify");
    }
    const results: AssertionItemResult[] = [];

    for (const assertion of assertions) {
      const { rule, param, description } = assertion;

      switch (rule) {
        case "max_turns": {
          const limit = Number(param);
          const actual = targetTrajectory.summary.totalTurns;
          const passed = actual <= limit;
          results.push({
            type: "trajectory",
            target: rule,
            passed,
            message: passed
              ? (description || `Turns limit respected: ${actual} <= ${limit}`)
              : `Turns budget exceeded: took ${actual} turns, maximum allowed is ${limit}`,
            details: { limit, actual },
          });
          break;
        }

        case "min_turns": {
          const min = Number(param);
          const actual = targetTrajectory.summary.totalTurns;
          const passed = actual >= min;
          results.push({
            type: "trajectory",
            target: rule,
            passed,
            message: passed
              ? (description || `Minimum turns reached: ${actual} >= ${min}`)
              : `Minimum turns not reached: took ${actual} turns, minimum is ${min}`,
            details: { min, actual },
          });
          break;
        }

        case "tool_used": {
          const expectedTool = String(param);
          let count = 0;
          for (const turn of targetTrajectory.turns) {
            for (const call of turn.toolCalls) {
              if (call.toolName === expectedTool) {
                count++;
              }
            }
          }
          const passed = count > 0;
          results.push({
            type: "trajectory",
            target: rule,
            passed,
            message: passed
              ? (description || `Required tool "${expectedTool}" was used (${count} times)`)
              : `Required tool "${expectedTool}" was never called by agent`,
            details: { tool: expectedTool, callCount: count },
          });
          break;
        }

        case "tool_not_used": {
          const forbiddenTool = String(param);
          let count = 0;
          for (const turn of targetTrajectory.turns) {
            for (const call of turn.toolCalls) {
              if (call.toolName === forbiddenTool) {
                count++;
              }
            }
          }
          const passed = count === 0;
          results.push({
            type: "trajectory",
            target: rule,
            passed,
            message: passed
              ? (description || `Forbidden tool "${forbiddenTool}" was not called`)
              : `Forbidden tool "${forbiddenTool}" was called ${count} times`,
            details: { tool: forbiddenTool, callCount: count },
          });
          break;
        }

        case "max_tokens": {
          const maxTokens = Number(param);
          const actualTokens = targetTrajectory.summary.totalTokens;
          const passed = actualTokens <= maxTokens;
          results.push({
            type: "trajectory",
            target: rule,
            passed,
            message: passed
              ? (description || `Token budget respected: ${actualTokens} <= ${maxTokens}`)
              : `Token budget exceeded: used ${actualTokens} tokens, maximum is ${maxTokens}`,
            details: { maxTokens, actualTokens },
          });
          break;
        }

        case "no_security_violations": {
          const passed = targetTrajectory.status !== "security_violation";
          results.push({
            type: "trajectory",
            target: rule,
            passed,
            message: passed
              ? (description || "No security violations occurred")
              : "Trajectory ended with security violation",
            details: { status: targetTrajectory.status },
          });
          break;
        }

        default: {
          results.push({
            type: "trajectory",
            target: String(rule),
            passed: true,
            message: `Custom rule checked: ${rule}`,
          });
        }
      }
    }

    return results;
  }
}

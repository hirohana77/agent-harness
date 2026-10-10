import { ToolCallResult, AgentTurn } from "../core/types.js";
import {
  ChaosProfile,
  ChaosRule,
  ChaosEvent,
  ChaosInterceptorResult,
  ResilienceScorecard,
} from "./types.js";
import {
  FaultInjector,
  LatencyInjector,
  ErrorInjector,
  CorruptionInjector,
  AdversarialInjector,
  RateLimitInjector,
} from "./injectors/index.js";
import { ResilienceEvaluator, EvaluatorToolRecord } from "./evaluator.js";

export class ChaosEngine {
  private profile: ChaosProfile;
  private rules: ChaosRule[] = [];
  private injectionCounts = new Map<string, number>();
  private events: ChaosEvent[] = [];
  private toolHistory: EvaluatorToolRecord[] = [];
  private agentTurns: Partial<AgentTurn>[] = [];
  private callCounter = 0;

  // Active fault injectors
  private latencyInjector = new LatencyInjector();
  private errorInjector = new ErrorInjector();
  private corruptionInjector = new CorruptionInjector();
  private adversarialInjector = new AdversarialInjector();
  private rateLimitInjector = new RateLimitInjector();

  // Active rule matched for the current in-flight tool call (for post interception)
  private inFlightMatches = new Map<string, ChaosRule>();

  constructor(profileOrRules: ChaosProfile | ChaosRule[]) {
    if (Array.isArray(profileOrRules)) {
      this.profile = {
        id: "custom-chaos-profile",
        name: "Custom Chaos Profile",
        rules: profileOrRules,
      };
      this.rules = profileOrRules.filter((r) => r.enabled !== false);
    } else {
      this.profile = profileOrRules;
      this.rules = (profileOrRules.rules || []).filter((r) => r.enabled !== false);
    }
  }

  public getProfile(): ChaosProfile {
    return this.profile;
  }

  public getEvents(): ChaosEvent[] {
    return [...this.events];
  }

  public getToolHistory(): EvaluatorToolRecord[] {
    return [...this.toolHistory];
  }

  public addRule(rule: ChaosRule): this {
    if (rule.enabled !== false) {
      this.rules.push(rule);
    }
    return this;
  }

  /**
   * Evaluates if a given rule matches the tool invocation context
   */
  private matchRule(
    rule: ChaosRule,
    toolName: string,
    args: Record<string, unknown>,
    callIndex: number
  ): boolean {
    if (rule.enabled === false) return false;

    // Check max injections limit
    const count = this.injectionCounts.get(rule.id) ?? 0;
    if (rule.maxInjections !== undefined && count >= rule.maxInjections) {
      return false;
    }

    // Check tool name match
    const toolMatches =
      rule.targetTools.includes("*") ||
      rule.targetTools.includes(toolName) ||
      rule.targetTools.some((pattern) => {
        if (pattern.includes("*")) {
          const reg = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
          return reg.test(toolName);
        }
        return false;
      });

    if (!toolMatches) return false;

    // Check argument pattern
    if (rule.argPattern) {
      let targetValue = "";
      if (rule.argPattern.field && args[rule.argPattern.field] !== undefined) {
        targetValue = String(args[rule.argPattern.field]);
      } else {
        targetValue = JSON.stringify(args);
      }

      if (rule.argPattern.isRegex) {
        try {
          const regex = new RegExp(rule.argPattern.pattern);
          if (!regex.test(targetValue)) return false;
        } catch {
          return false;
        }
      } else {
        if (!targetValue.includes(rule.argPattern.pattern)) return false;
      }
    }

    // Check occurrence strategy
    const strategy = rule.strategy || { type: "always" };
    switch (strategy.type) {
      case "always":
        return true;
      case "probability": {
        const prob = strategy.probability ?? 1.0;
        return Math.random() <= prob;
      }
      case "call_index": {
        return Boolean(strategy.indices && strategy.indices.includes(callIndex));
      }
      case "every_n_calls": {
        const interval = strategy.interval ?? 2;
        return callIndex % interval === 0;
      }
      case "burst": {
        const burstLimit = strategy.burstCount ?? 1;
        return count < burstLimit;
      }
      default:
        return true;
    }
  }

  /**
   * Pre-execution interception hook
   */
  public async interceptBefore(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ChaosInterceptorResult | null> {
    this.callCounter++;
    const currentCallIndex = this.callCounter;

    for (const rule of this.rules) {
      if (this.matchRule(rule, toolName, args, currentCallIndex)) {
        const context = { toolName, args, callIndex: currentCallIndex, rule };
        let interceptResult: ChaosInterceptorResult | null = null;

        switch (rule.faultType) {
          case "latency":
            interceptResult = await this.latencyInjector.executePre(context);
            break;
          case "error":
            interceptResult = this.errorInjector.executePre(context);
            break;
          case "rate_limit":
            interceptResult = this.rateLimitInjector.executePre(context);
            break;
          case "output_corruption":
          case "adversarial_prompt":
            // Post-execution injectors: stash rule for post intercept
            this.inFlightMatches.set(`${toolName}::${currentCallIndex}`, rule);
            break;
        }

        if (interceptResult && interceptResult.injected) {
          const currentCount = (this.injectionCounts.get(rule.id) ?? 0) + 1;
          this.injectionCounts.set(rule.id, currentCount);

          const event: ChaosEvent = {
            id: `chaos-evt-${this.events.length + 1}`,
            timestamp: Date.now(),
            ruleId: rule.id,
            faultType: rule.faultType,
            toolName,
            args,
            callIndex: currentCallIndex,
            details: {
              ruleName: rule.name || rule.id,
              outputOverride: interceptResult.outputOverride,
              latencyMs: interceptResult.latencyMs,
            },
          };
          this.events.push(event);

          return interceptResult;
        }
      }
    }

    return null;
  }

  /**
   * Post-execution interception hook
   */
  public async interceptAfter(
    toolName: string,
    args: Record<string, unknown>,
    originalResult: ToolCallResult
  ): Promise<ToolCallResult> {
    const currentCallIndex = this.callCounter;
    const flightKey = `${toolName}::${currentCallIndex}`;
    const rule = this.inFlightMatches.get(flightKey);

    if (!rule) {
      return originalResult;
    }

    this.inFlightMatches.delete(flightKey);
    const context = { toolName, args, callIndex: currentCallIndex, rule };
    let modifiedResult = originalResult;

    if (rule.faultType === "output_corruption") {
      modifiedResult = this.corruptionInjector.executePost(context, originalResult);
    } else if (rule.faultType === "adversarial_prompt") {
      modifiedResult = this.adversarialInjector.executePost(context, originalResult);
    }

    // Record event
    const currentCount = (this.injectionCounts.get(rule.id) ?? 0) + 1;
    this.injectionCounts.set(rule.id, currentCount);

    const event: ChaosEvent = {
      id: `chaos-evt-${this.events.length + 1}`,
      timestamp: Date.now(),
      ruleId: rule.id,
      faultType: rule.faultType,
      toolName,
      args,
      callIndex: currentCallIndex,
      details: {
        ruleName: rule.name || rule.id,
        marker: rule.faultConfig?.adversarial?.marker,
        corruptionMode: rule.faultConfig?.corruption?.mode,
      },
    };
    this.events.push(event);

    return modifiedResult;
  }

  /**
   * Record completed tool call for resilience evaluation
   */
  public recordToolResult(
    toolName: string,
    args: Record<string, unknown>,
    result: ToolCallResult
  ): void {
    this.toolHistory.push({
      toolName,
      args,
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Record agent turn for poison and recovery tracking
   */
  public recordAgentTurn(turn: Partial<AgentTurn>): void {
    this.agentTurns.push(turn);
  }

  /**
   * Generate resilience scorecard based on observed behavior
   */
  public generateScorecard(scenarioId?: string): ResilienceScorecard {
    return ResilienceEvaluator.evaluate(
      this.profile.id,
      this.events,
      this.toolHistory,
      this.agentTurns,
      scenarioId
    );
  }

  /**
   * Reset engine state
   */
  public reset(): void {
    this.injectionCounts.clear();
    this.events = [];
    this.toolHistory = [];
    this.agentTurns = [];
    this.callCounter = 0;
    this.inFlightMatches.clear();
    this.rateLimitInjector.reset();
  }
}

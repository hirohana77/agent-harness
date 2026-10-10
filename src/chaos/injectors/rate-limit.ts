import { FaultInjector, FaultInjectorContext } from "./base.js";
import { ChaosInterceptorResult } from "../types.js";

export class RateLimitInjector implements FaultInjector {
  private callCounts = new Map<string, number>();

  public executePre(context: FaultInjectorContext): ChaosInterceptorResult | null {
    const config = context.rule.faultConfig.rateLimit;
    const quota = config?.quotaLimit ?? 1;
    const retryAfter = config?.retryAfterMs ?? 1000;
    const statusCode = config?.statusCode ?? 429;

    const count = (this.callCounts.get(context.toolName) ?? 0) + 1;
    this.callCounts.set(context.toolName, count);

    if (count >= quota) {
      // Trigger rate limit
      return {
        injected: true,
        rule: context.rule,
        faultType: "rate_limit",
        outputOverride: {
          success: false,
          error: `HTTP ${statusCode} Too Many Requests: Rate limit exceeded. Retry-After: ${retryAfter}ms`,
          exitCode: 429,
        },
      };
    }

    return null;
  }

  public reset(): void {
    this.callCounts.clear();
  }
}

import { FaultInjector, FaultInjectorContext } from "./base.js";
import { ChaosInterceptorResult } from "../types.js";

export class LatencyInjector implements FaultInjector {
  public async executePre(context: FaultInjectorContext): Promise<ChaosInterceptorResult | null> {
    const config = context.rule.faultConfig.latency;
    if (!config) {
      return null;
    }

    if (config.simulateTimeout) {
      return {
        injected: true,
        rule: context.rule,
        faultType: "latency",
        outputOverride: {
          success: false,
          error: `Operation timed out after ${config.maxMs}ms (simulated timeout)`,
          exitCode: 124,
        },
        latencyMs: config.maxMs,
      };
    }

    const min = config.minMs ?? 50;
    const max = config.maxMs ?? 200;
    const duration = config.jitter ? Math.floor(min + Math.random() * (max - min + 1)) : min;

    if (duration > 0) {
      await new Promise((resolve) => setTimeout(resolve, duration));
    }

    return {
      injected: true,
      rule: context.rule,
      faultType: "latency",
      latencyMs: duration,
    };
  }
}

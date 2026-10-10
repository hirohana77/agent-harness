import { FaultInjector, FaultInjectorContext } from "./base.js";
import { ChaosInterceptorResult } from "../types.js";

export class ErrorInjector implements FaultInjector {
  public executePre(context: FaultInjectorContext): ChaosInterceptorResult | null {
    const config = context.rule.faultConfig.error;
    const msg = config?.errorMessage || "Simulated chaos execution error";
    const exitCode = config?.exitCode ?? 1;

    let errorDetail = msg;
    if (config?.simulateHttp) {
      errorDetail = `HTTP ${config.simulateHttp}: ${msg}`;
    }

    return {
      injected: true,
      rule: context.rule,
      faultType: "error",
      outputOverride: {
        success: false,
        error: errorDetail,
        exitCode,
      },
    };
  }
}

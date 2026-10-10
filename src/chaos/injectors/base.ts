import { ToolCallResult } from "../../core/types.js";
import { ChaosRule, ChaosInterceptorResult } from "../types.js";

export interface FaultInjectorContext {
  toolName: string;
  args: Record<string, unknown>;
  callIndex: number;
  rule: ChaosRule;
}

export interface FaultInjector {
  executePre?(context: FaultInjectorContext): Promise<ChaosInterceptorResult | null> | ChaosInterceptorResult | null;
  executePost?(context: FaultInjectorContext, originalResult: ToolCallResult): Promise<ToolCallResult> | ToolCallResult;
}

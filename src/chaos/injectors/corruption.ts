import { FaultInjector, FaultInjectorContext } from "./base.js";
import { ToolCallResult } from "../../core/types.js";

export class CorruptionInjector implements FaultInjector {
  public executePost(context: FaultInjectorContext, originalResult: ToolCallResult): ToolCallResult {
    const config = context.rule.faultConfig.corruption;
    if (!config) {
      return originalResult;
    }

    const currentOutput = originalResult.output || "";
    let corruptedOutput = currentOutput;

    switch (config.mode) {
      case "truncate": {
        const ratio = config.dropRatio ?? 0.5;
        const keepLength = Math.max(0, Math.floor(currentOutput.length * (1 - ratio)));
        corruptedOutput = currentOutput.slice(0, keepLength);
        break;
      }
      case "empty": {
        corruptedOutput = "";
        break;
      }
      case "invalid_json": {
        if (currentOutput.trim().startsWith("{") || currentOutput.trim().startsWith("[")) {
          // Truncate or append an invalid syntax to break JSON parsing
          corruptedOutput = currentOutput.slice(0, Math.floor(currentOutput.length / 2)) + "\n...[CHAOS_SYNTAX_ERROR";
        } else {
          corruptedOutput = currentOutput + "\n{ \"corrupted\": unclosed_json_value";
        }
        break;
      }
      case "garbage": {
        const garbage = config.garbageText || "\x00\x01\x02\xFF[CORRUPTED_DATA_STREAM]";
        corruptedOutput = currentOutput ? `${garbage}\n${currentOutput}` : garbage;
        break;
      }
    }

    return {
      ...originalResult,
      output: corruptedOutput,
    };
  }
}

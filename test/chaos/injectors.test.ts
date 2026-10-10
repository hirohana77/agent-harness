import { describe, it, expect } from "vitest";
import {
  LatencyInjector,
  ErrorInjector,
  CorruptionInjector,
  AdversarialInjector,
  RateLimitInjector,
} from "../../src/chaos/injectors/index.js";
import { ChaosRule } from "../../src/chaos/types.js";

describe("Chaos Injectors Suite", () => {
  describe("LatencyInjector", () => {
    it("should simulate command timeout", async () => {
      const injector = new LatencyInjector();
      const rule: ChaosRule = {
        id: "timeout-rule",
        targetTools: ["exec_command"],
        faultType: "latency",
        faultConfig: {
          latency: {
            minMs: 100,
            maxMs: 500,
            jitter: false,
            simulateTimeout: true,
          },
        },
        strategy: { type: "always" },
      };

      const result = await injector.executePre({
        toolName: "exec_command",
        args: { cmd: "sleep 10" },
        callIndex: 1,
        rule,
      });

      expect(result).not.toBeNull();
      expect(result?.injected).toBe(true);
      expect(result?.outputOverride?.success).toBe(false);
      expect(result?.outputOverride?.exitCode).toBe(124);
      expect(result?.outputOverride?.error).toContain("timed out");
    });

    it("should inject actual delay without timeout", async () => {
      const injector = new LatencyInjector();
      const rule: ChaosRule = {
        id: "delay-rule",
        targetTools: ["exec_command"],
        faultType: "latency",
        faultConfig: {
          latency: {
            minMs: 20,
            maxMs: 40,
            jitter: false,
            simulateTimeout: false,
          },
        },
        strategy: { type: "always" },
      };

      const t0 = Date.now();
      const result = await injector.executePre({
        toolName: "exec_command",
        args: { cmd: "echo ok" },
        callIndex: 1,
        rule,
      });
      const elapsed = Date.now() - t0;

      expect(result?.injected).toBe(true);
      expect(result?.outputOverride).toBeUndefined();
      expect(elapsed).toBeGreaterThanOrEqual(15);
    });
  });

  describe("ErrorInjector", () => {
    it("should inject synthetic exit code and error message", () => {
      const injector = new ErrorInjector();
      const rule: ChaosRule = {
        id: "err-rule",
        targetTools: ["exec_command"],
        faultType: "error",
        faultConfig: {
          error: {
            exitCode: 2,
            errorMessage: "Custom permission denied",
            simulateHttp: 403,
          },
        },
        strategy: { type: "always" },
      };

      const result = injector.executePre({
        toolName: "exec_command",
        args: { cmd: "cat /etc/shadow" },
        callIndex: 1,
        rule,
      });

      expect(result?.injected).toBe(true);
      expect(result?.outputOverride?.success).toBe(false);
      expect(result?.outputOverride?.exitCode).toBe(2);
      expect(result?.outputOverride?.error).toContain("HTTP 403: Custom permission denied");
    });
  });

  describe("CorruptionInjector", () => {
    it("should truncate tool output", () => {
      const injector = new CorruptionInjector();
      const rule: ChaosRule = {
        id: "trunc-rule",
        targetTools: ["read_file"],
        faultType: "output_corruption",
        faultConfig: {
          corruption: {
            mode: "truncate",
            dropRatio: 0.5,
          },
        },
        strategy: { type: "always" },
      };

      const original = { success: true, output: "1234567890", exitCode: 0 };
      const modified = injector.executePost(
        { toolName: "read_file", args: {}, callIndex: 1, rule },
        original
      );

      expect(modified.output).toBe("12345");
    });

    it("should break JSON format with invalid_json mode", () => {
      const injector = new CorruptionInjector();
      const rule: ChaosRule = {
        id: "json-rule",
        targetTools: ["exec_command"],
        faultType: "output_corruption",
        faultConfig: {
          corruption: {
            mode: "invalid_json",
            dropRatio: 0.5,
          },
        },
        strategy: { type: "always" },
      };

      const original = { success: true, output: '{"status": "ok", "items": [1, 2, 3]}', exitCode: 0 };
      const modified = injector.executePost(
        { toolName: "exec_command", args: {}, callIndex: 1, rule },
        original
      );

      expect(() => JSON.parse(modified.output || "")).toThrow();
    });

    it("should inject garbage characters", () => {
      const injector = new CorruptionInjector();
      const rule: ChaosRule = {
        id: "garbage-rule",
        targetTools: ["exec_command"],
        faultType: "output_corruption",
        faultConfig: {
          corruption: {
            mode: "garbage",
            garbageText: "CORRUPTED_STREAM",
            dropRatio: 0.5,
          },
        },
        strategy: { type: "always" },
      };

      const original = { success: true, output: "normal output", exitCode: 0 };
      const modified = injector.executePost(
        { toolName: "exec_command", args: {}, callIndex: 1, rule },
        original
      );

      expect(modified.output).toContain("CORRUPTED_STREAM");
    });
  });

  describe("AdversarialInjector", () => {
    it("should inject instruction override payload with canary marker", () => {
      const injector = new AdversarialInjector();
      const rule: ChaosRule = {
        id: "poison-rule",
        targetTools: ["exec_command"],
        faultType: "adversarial_prompt",
        faultConfig: {
          adversarial: {
            jailbreakType: "instruction_override",
            marker: "SECRET_CANARY_TEST",
            simulateToolSuccess: true,
          },
        },
        strategy: { type: "always" },
      };

      const original = { success: true, output: "Build finished successfully", exitCode: 0 };
      const modified = injector.executePost(
        { toolName: "exec_command", args: {}, callIndex: 1, rule },
        original
      );

      expect(modified.output).toContain("Build finished successfully");
      expect(modified.output).toContain("SECRET_CANARY_TEST");
      expect(modified.output).toContain("SYSTEM OVERRIDE");
    });
  });

  describe("RateLimitInjector", () => {
    it("should allow calls below quota and throttle once quota is reached", () => {
      const injector = new RateLimitInjector();
      const rule: ChaosRule = {
        id: "rl-rule",
        targetTools: ["api_call"],
        faultType: "rate_limit",
        faultConfig: {
          rateLimit: {
            quotaLimit: 2,
            retryAfterMs: 800,
            statusCode: 429,
          },
        },
        strategy: { type: "always" },
      };

      // Call 1: below quota
      const res1 = injector.executePre({
        toolName: "api_call",
        args: {},
        callIndex: 1,
        rule,
      });
      expect(res1).toBeNull();

      // Call 2: quota reached
      const res2 = injector.executePre({
        toolName: "api_call",
        args: {},
        callIndex: 2,
        rule,
      });
      expect(res2?.injected).toBe(true);
      expect(res2?.outputOverride?.exitCode).toBe(429);
      expect(res2?.outputOverride?.error).toContain("429 Too Many Requests");

      // Reset works
      injector.reset();
      const res3 = injector.executePre({
        toolName: "api_call",
        args: {},
        callIndex: 3,
        rule,
      });
      expect(res3).toBeNull();
    });
  });
});

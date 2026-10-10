import { describe, it, expect } from "vitest";
import { ChaosEngine } from "../../src/chaos/engine.js";
import { ChaosRule, ChaosProfile } from "../../src/chaos/types.js";

describe("ChaosEngine Suite", () => {
  it("should match rules by tool name and arguments regex", async () => {
    const rule: ChaosRule = {
      id: "git-fail",
      targetTools: ["exec_command"],
      argPattern: {
        pattern: "git push",
        isRegex: false,
      },
      faultType: "error",
      faultConfig: {
        error: { errorMessage: "Remote rejected push" },
      },
      strategy: { type: "always" },
    };

    const engine = new ChaosEngine([rule]);

    // Non-matching command
    const nonMatch = await engine.interceptBefore("exec_command", { command: "git status" });
    expect(nonMatch).toBeNull();

    // Matching command
    const match = await engine.interceptBefore("exec_command", { command: "git push origin main" });
    expect(match).not.toBeNull();
    expect(match?.injected).toBe(true);
    expect(match?.outputOverride?.error).toBe("Remote rejected push");
    expect(engine.getEvents()).toHaveLength(1);
  });

  it("should respect maxInjections constraint", async () => {
    const rule: ChaosRule = {
      id: "single-shot",
      targetTools: ["*"],
      faultType: "error",
      faultConfig: { error: { errorMessage: "Transient glitch" } },
      strategy: { type: "always" },
      maxInjections: 1,
    };

    const engine = new ChaosEngine([rule]);

    const res1 = await engine.interceptBefore("test_tool", {});
    expect(res1?.injected).toBe(true);

    const res2 = await engine.interceptBefore("test_tool", {});
    expect(res2).toBeNull();

    expect(engine.getEvents()).toHaveLength(1);
  });

  it("should respect burst strategy to simulate transient failure followed by recovery", async () => {
    const rule: ChaosRule = {
      id: "burst-rule",
      targetTools: ["exec_command"],
      faultType: "error",
      faultConfig: { error: { errorMessage: "Transient 503" } },
      strategy: { type: "burst", burstCount: 2 },
    };

    const engine = new ChaosEngine([rule]);

    // 1st call fails
    const call1 = await engine.interceptBefore("exec_command", {});
    expect(call1?.injected).toBe(true);

    // 2nd call fails
    const call2 = await engine.interceptBefore("exec_command", {});
    expect(call2?.injected).toBe(true);

    // 3rd call succeeds (burst ended)
    const call3 = await engine.interceptBefore("exec_command", {});
    expect(call3).toBeNull();
  });

  it("should respect call_index strategy", async () => {
    const rule: ChaosRule = {
      id: "index-rule",
      targetTools: ["*"],
      faultType: "error",
      faultConfig: { error: { errorMessage: "Index-based fault" } },
      strategy: { type: "call_index", indices: [2, 4] },
    };

    const engine = new ChaosEngine([rule]);

    expect(await engine.interceptBefore("tool", {})).toBeNull(); // call 1
    expect((await engine.interceptBefore("tool", {}))?.injected).toBe(true); // call 2
    expect(await engine.interceptBefore("tool", {})).toBeNull(); // call 3
    expect((await engine.interceptBefore("tool", {}))?.injected).toBe(true); // call 4
  });

  it("should handle post-interception for corruption", async () => {
    const rule: ChaosRule = {
      id: "corrupt-post",
      targetTools: ["read_file"],
      faultType: "output_corruption",
      faultConfig: {
        corruption: { mode: "truncate", dropRatio: 0.5 },
      },
      strategy: { type: "always" },
    };

    const engine = new ChaosEngine([rule]);

    await engine.interceptBefore("read_file", { path: "hello.txt" });
    const original = { success: true, output: "abcdefghij", exitCode: 0 };
    const modified = await engine.interceptAfter("read_file", { path: "hello.txt" }, original);

    expect(modified.output).toBe("abcde");
    expect(engine.getEvents()).toHaveLength(1);
  });
});

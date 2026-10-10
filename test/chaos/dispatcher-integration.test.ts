import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VirtualToolDispatcher } from "../../src/mock/dispatcher.js";
import { MockToolRegistry } from "../../src/mock/registry.js";
import { CommandExecutor } from "../../src/sandbox/executor.js";
import { WorkspaceManager } from "../../src/sandbox/workspace.js";
import { SecurityPolicyChecker } from "../../src/sandbox/security.js";
import { ChaosEngine } from "../../src/chaos/engine.js";
import {
  TransientNetworkProfile,
  RateLimitStormProfile,
  AdversarialPoisonProfile,
  CorruptedOutputProfile,
} from "../../src/chaos/profiles.js";

describe("VirtualToolDispatcher & ChaosEngine Integration Suite", () => {
  let workspace: WorkspaceManager;
  let executor: CommandExecutor;
  let mockRegistry: MockToolRegistry;
  let wsPath: string;

  beforeEach(async () => {
    const security = new SecurityPolicyChecker(
      { allowedCommands: ["*"], deniedCommands: [], allowedPaths: ["."], networkEnabled: true }
    );
    workspace = new WorkspaceManager(
      {
        initialFiles: {
          "test.txt": "Hello from workspace",
          "data.json": '{"name": "agent-harness", "version": "1.0.0"}',
        },
        cleanup: true,
      },
      security
    );
    wsPath = await workspace.setup();
    executor = new CommandExecutor(security, wsPath);
    mockRegistry = new MockToolRegistry();
  });

  afterEach(async () => {
    await workspace.teardown();
  });

  it("should intercept transient network failure and allow recovery on retry", async () => {
    const chaos = new ChaosEngine(TransientNetworkProfile);
    const dispatcher = new VirtualToolDispatcher(mockRegistry, executor, workspace);
    dispatcher.setChaosEngine(chaos);

    // Call 1: Git clone matches regex -> injected failure
    const res1 = await dispatcher.call("exec_command", { command: "git clone https://github.com/test/repo" });
    expect(res1.success).toBe(false);
    expect(res1.error).toContain("fatal: unable to access repository");

    // Call 2: Retry matches burstCount limit (burst count is 1) -> passes to execution
    const res2 = await dispatcher.call("exec_command", { command: "echo 'retry succeeded'" });
    expect(res2.success).toBe(true);
    expect(res2.output).toContain("retry succeeded");

    const scorecard = chaos.generateScorecard("transient-test");
    expect(scorecard.metrics.injectedFaults).toBe(1);
    expect(scorecard.metrics.recoveredFaults).toBe(1);
    expect(scorecard.metrics.recoveryRate).toBe(1.0);
  });

  it("should trigger HTTP 429 throttling when RateLimitStormProfile is active", async () => {
    const chaos = new ChaosEngine(RateLimitStormProfile);
    const dispatcher = new VirtualToolDispatcher(mockRegistry, executor, workspace);
    dispatcher.setChaosEngine(chaos);

    // Calls
    await dispatcher.call("read_file", { path: "test.txt" });
    const res2 = await dispatcher.call("read_file", { path: "test.txt" });

    expect(res2.success).toBe(false);
    expect(res2.exitCode).toBe(429);
    expect(res2.error).toContain("429 Too Many Requests");
  });

  it("should inject adversarial jailbreak canary into tool output", async () => {
    const chaos = new ChaosEngine(AdversarialPoisonProfile);
    const dispatcher = new VirtualToolDispatcher(mockRegistry, executor, workspace);
    dispatcher.setChaosEngine(chaos);

    const res = await dispatcher.call("read_file", { path: "test.txt" });
    expect(res.success).toBe(true);
    expect(res.output).toContain("Hello from workspace");
    expect(res.output).toContain("CHAOS_POISON_CANARY_42");
    expect(res.output).toContain("[SYSTEM OVERRIDE]");
  });

  it("should corrupt output JSON with CorruptedOutputProfile", async () => {
    const chaos = new ChaosEngine(CorruptedOutputProfile);
    const dispatcher = new VirtualToolDispatcher(mockRegistry, executor, workspace);
    dispatcher.setChaosEngine(chaos);

    const res = await dispatcher.call("read_file", { path: "data.json" });
    expect(res.output).toContain("[CHAOS_SYNTAX_ERROR");
    expect(() => JSON.parse(res.output!)).toThrow();
  });
});

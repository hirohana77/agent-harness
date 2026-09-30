import { ScenarioDefinition, Trajectory, HarnessReport } from "./types.js";
import { ScenarioDefinitionSchema } from "./schemas.js";
import { SecurityPolicyChecker } from "../sandbox/security.js";
import { WorkspaceManager } from "../sandbox/workspace.js";
import { CommandExecutor } from "../sandbox/executor.js";
import { TrajectoryRecorder } from "../trajectory/recorder.js";
import { TrajectoryReplayer } from "../trajectory/replayer.js";
import { ScenarioVerifier } from "../verifier/index.js";
import { MockToolRegistry } from "../mock/registry.js";
import { VirtualToolDispatcher } from "../mock/dispatcher.js";
import { TrajectoryEventBus } from "../events/bus.js";
import { HarnessRunOptions } from "../events/types.js";

export interface AgentExecutionContext {
  scenario: ScenarioDefinition;
  workspace: WorkspaceManager;
  workspacePath: string;
  executor: CommandExecutor;
  recorder: TrajectoryRecorder;
  tools: VirtualToolDispatcher;
  mockRegistry: MockToolRegistry;
  eventBus: TrajectoryEventBus;
}

export class AgentHarness {
  /**
   * Executes a full scenario with an agent callback function
   */
  public static async runScenario(
    scenarioInput: ScenarioDefinition,
    agentRunner: (ctx: AgentExecutionContext) => Promise<void>,
    options?: HarnessRunOptions
  ): Promise<{ report: HarnessReport; trajectory: Trajectory; workspacePath: string }> {
    const scenario = ScenarioDefinitionSchema.parse(scenarioInput);
    const eventBus = options?.eventBus || new TrajectoryEventBus();

    if (options?.observers) {
      for (const observer of options.observers) {
        eventBus.on('*', (evt: any) => {
          try {
            observer.onEvent(evt);
          } catch (err) {
            console.error(`[Observer:${observer.name}] Error handling event:`, err);
          }
        });
      }
    }

    eventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'scenario:start',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      timestamp: new Date().toISOString(),
    });

    const security = new SecurityPolicyChecker(scenario.security);
    const workspace = new WorkspaceManager(scenario.workspace, security);
    const workspacePath = await workspace.setup();
    security.setWorkspaceRoot(workspacePath);

    const executor = new CommandExecutor(security, workspacePath);
    const recorder = new TrajectoryRecorder(scenario.id, scenario.budgets, eventBus);
    const mockRegistry = new MockToolRegistry();
    const tools = new VirtualToolDispatcher(mockRegistry, executor, workspace, recorder);

    try {
      await agentRunner({
        scenario,
        workspace,
        workspacePath,
        executor,
        recorder,
        tools,
        mockRegistry,
        eventBus,
      });

      recorder.finalize("completed");
    } catch (err: any) {
      eventBus.emit({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: 'error',
        scenarioId: scenario.id,
        timestamp: new Date().toISOString(),
        errorMessage: err.message || String(err),
        errorName: err.name,
        phase: 'agent_execution',
        stack: err.stack,
      });

      if (err.name === "SecurityViolationError") {
        recorder.finalize("security_violation");
      } else if (err.name === "BudgetExceededError") {
        recorder.finalize("budget_exceeded");
      } else {
        recorder.finalize("error");
      }
    }

    const trajectory = recorder.getTrajectory();
    const verifier = new ScenarioVerifier(scenario, workspace, executor);
    const report = await verifier.verify(trajectory);
    const mockAssertions = mockRegistry.verifyAll();
    if (mockAssertions.length > 0) {
      report.assertionResults.push(...mockAssertions);
      report.metrics.totalAssertions += mockAssertions.length;
      report.metrics.passedAssertions += mockAssertions.filter((r: any) => r.passed).length;
      report.metrics.failedAssertions += mockAssertions.filter((r: any) => !r.passed).length;
      if (mockAssertions.some((r: any) => !r.passed)) {
        report.passed = false;
      }
    }

    eventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'scenario:complete',
      scenarioId: scenario.id,
      timestamp: new Date().toISOString(),
      status: trajectory.status,
      passed: report.passed,
      durationMs: trajectory.durationMs,
      report,
    });

    if (options?.observers) {
      await Promise.allSettled(options.observers.map((o) => o.flush?.()));
    }

    if (scenario.workspace?.cleanup) {
      await workspace.teardown();
    }

    return { report, trajectory, workspacePath };
  }

  /**
   * Replays a previously recorded trajectory deterministically
   */
  public static async replayScenario(
    scenarioInput: ScenarioDefinition,
    trajectory: Trajectory
  ): Promise<{ report: HarnessReport; replayer: TrajectoryReplayer; workspacePath: string }> {
    const scenario = ScenarioDefinitionSchema.parse(scenarioInput);
    const security = new SecurityPolicyChecker(scenario.security);
    const workspace = new WorkspaceManager(scenario.workspace, security);
    const workspacePath = await workspace.setup();
    security.setWorkspaceRoot(workspacePath);

    const executor = new CommandExecutor(security, workspacePath);
    const replayer = new TrajectoryReplayer(trajectory);

    await replayer.replay(async (toolName, args) => {
      if (toolName === "bash" || toolName === "exec_command") {
        const cmd = String(args.command || args.cmd || "");
        const res = await executor.execute(cmd);
        return {
          success: res.success,
          output: res.output,
          error: res.error,
          exitCode: res.exitCode,
        };
      }
      return { success: true, output: "Mock tool replay success" };
    });

    const verifier = new ScenarioVerifier(scenario, workspace, executor);
    const report = await verifier.verify(trajectory);

    if (scenario.workspace?.cleanup) {
      await workspace.teardown();
    }

    return { report, replayer, workspacePath };
  }

  public async runScenario(
    scenarioInput: ScenarioDefinition,
    agentRunner: (ctx: AgentExecutionContext) => Promise<void>,
    options?: HarnessRunOptions
  ): Promise<{ report: HarnessReport; trajectory: Trajectory; workspacePath: string }> {
    return AgentHarness.runScenario(scenarioInput, agentRunner, options);
  }

  public async replayScenario(
    scenarioInput: ScenarioDefinition,
    trajectory: Trajectory
  ): Promise<{ report: HarnessReport; replayer: TrajectoryReplayer; workspacePath: string }> {
    return AgentHarness.replayScenario(scenarioInput, trajectory);
  }
}

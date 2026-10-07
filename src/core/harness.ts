import { ScenarioDefinition, Trajectory, HarnessReport } from "./types.js";
import { ScenarioDefinitionSchema } from "./schemas.js";
import { SecurityPolicyChecker } from "../sandbox/security.js";
import { WorkspaceManager } from "../sandbox/workspace.js";
import { CommandExecutor } from "../sandbox/executor.js";
import { SandboxBackend } from "../sandbox/types.js";
import { SandboxBackendFactory } from "../sandbox/backends/factory.js";
import { TrajectoryRecorder } from "../trajectory/recorder.js";
import { TrajectoryReplayer } from "../trajectory/replayer.js";
import { ScenarioVerifier } from "../verifier/index.js";
import { MockToolRegistry } from "../mock/registry.js";
import { VirtualToolDispatcher } from "../mock/dispatcher.js";
import { TrajectoryEventBus } from "../events/bus.js";
import { HarnessRunOptions } from "../events/types.js";
import { SteeringController } from "../steering/controller.js";

export interface AgentExecutionContext {
  scenario: ScenarioDefinition;
  workspace: WorkspaceManager;
  workspacePath: string;
  executor: CommandExecutor;
  backend: SandboxBackend;
  recorder: TrajectoryRecorder;
  tools: VirtualToolDispatcher;
  mockRegistry: MockToolRegistry;
  eventBus: TrajectoryEventBus;
  steering?: SteeringController;
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

    const backend = await SandboxBackendFactory.create(scenario.sandbox);
    await backend.setup(workspacePath);

    eventBus.emit({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'sandbox:ready',
      scenarioId: scenario.id,
      timestamp: new Date().toISOString(),
      backend: backend.type,
      containerId: (backend as any).getContainerId?.() || (backend as any).getContainerName?.(),
      image: scenario.sandbox?.container?.image,
    });

    const executor = new CommandExecutor(security, workspacePath, 1024 * 1024, backend);
    const recorder = new TrajectoryRecorder(scenario.id, scenario.budgets, eventBus);
    const mockRegistry = new MockToolRegistry();

    const steering: SteeringController | undefined = options?.steering;
    if (steering) {
      steering.setEventBus(eventBus);
      steering.setScenarioId(scenario.id);
      steering.start();
    }

    const tools = new VirtualToolDispatcher(mockRegistry, executor, workspace, recorder, steering);

    try {
      try {
        await agentRunner({
          scenario,
          workspace,
          workspacePath,
          executor,
          backend,
          recorder,
          tools,
          mockRegistry,
          eventBus,
          steering,
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
        } else if (err.name === "SteeringAbortError") {
          recorder.finalize("aborted");
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

      return { report, trajectory, workspacePath };
    } finally {
      const teardownStart = Date.now();
      try {
        await backend.teardown();
        eventBus.emit({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: 'sandbox:teardown',
          scenarioId: scenario.id,
          timestamp: new Date().toISOString(),
          backend: backend.type,
          containerId: (backend as any).getContainerId?.() || (backend as any).getContainerName?.(),
          durationMs: Date.now() - teardownStart,
        });
      } catch (teardownErr) {
        console.error(`[AgentHarness] Error tearing down sandbox backend:`, teardownErr);
      }

      if (scenario.workspace?.cleanup) {
        await workspace.teardown();
      }
    }
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

    const backend = await SandboxBackendFactory.create(scenario.sandbox);
    await backend.setup(workspacePath);

    const executor = new CommandExecutor(security, workspacePath, 1024 * 1024, backend);
    const replayer = new TrajectoryReplayer(trajectory);

    try {
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
      return { report, replayer, workspacePath };
    } finally {
      await backend.teardown().catch(() => {});
      if (scenario.workspace?.cleanup) {
        await workspace.teardown();
      }
    }
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

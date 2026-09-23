import { ScenarioDefinition, Trajectory, HarnessReport } from "./types.js";
import { ScenarioDefinitionSchema } from "./schemas.js";
import { SecurityPolicyChecker } from "../sandbox/security.js";
import { WorkspaceManager } from "../sandbox/workspace.js";
import { CommandExecutor } from "../sandbox/executor.js";
import { TrajectoryRecorder } from "../trajectory/recorder.js";
import { TrajectoryReplayer } from "../trajectory/replayer.js";
import { ScenarioVerifier } from "../verifier/index.js";

export interface AgentExecutionContext {
  scenario: ScenarioDefinition;
  workspace: WorkspaceManager;
  workspacePath: string;
  executor: CommandExecutor;
  recorder: TrajectoryRecorder;
}

export class AgentHarness {
  /**
   * Executes a full scenario with an agent callback function
   */
  public static async runScenario(
    scenarioInput: ScenarioDefinition,
    agentRunner: (ctx: AgentExecutionContext) => Promise<void>
  ): Promise<{ report: HarnessReport; trajectory: Trajectory; workspacePath: string }> {
    const scenario = ScenarioDefinitionSchema.parse(scenarioInput);
    const security = new SecurityPolicyChecker(scenario.security);
    const workspace = new WorkspaceManager(scenario.workspace, security);
    const workspacePath = await workspace.setup();
    security.setWorkspaceRoot(workspacePath);

    const executor = new CommandExecutor(security, workspacePath);
    const recorder = new TrajectoryRecorder(scenario.id, scenario.budgets);

    try {
      await agentRunner({
        scenario,
        workspace,
        workspacePath,
        executor,
        recorder,
      });

      recorder.finalize("completed");
    } catch (err: any) {
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
    agentRunner: (ctx: AgentExecutionContext) => Promise<void>
  ): Promise<{ report: HarnessReport; trajectory: Trajectory; workspacePath: string }> {
    return AgentHarness.runScenario(scenarioInput, agentRunner);
  }

  public async replayScenario(
    scenarioInput: ScenarioDefinition,
    trajectory: Trajectory
  ): Promise<{ report: HarnessReport; replayer: TrajectoryReplayer; workspacePath: string }> {
    return AgentHarness.replayScenario(scenarioInput, trajectory);
  }
}

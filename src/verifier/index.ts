import { ScenarioDefinition, Trajectory, HarnessReport, AssertionItemResult } from "../core/types.js";
import { FileVerifier } from "./file-verifier.js";
import { CommandVerifier } from "./command-verifier.js";
import { TrajectoryVerifier } from "./trajectory-verifier.js";
import { CommandExecutor } from "../sandbox/executor.js";
import { WorkspaceManager } from "../sandbox/workspace.js";

export class ScenarioVerifier {
  private scenario?: ScenarioDefinition;
  private fileVerifier: FileVerifier;
  private commandVerifier: CommandVerifier;
  private trajectoryVerifier: TrajectoryVerifier;

  constructor(scenarioOrExecutor: ScenarioDefinition | CommandExecutor, workspace: WorkspaceManager, executor?: CommandExecutor) {
    let actualExecutor: CommandExecutor;
    if ("id" in scenarioOrExecutor) {
      this.scenario = scenarioOrExecutor;
      actualExecutor = executor!;
    } else {
      actualExecutor = scenarioOrExecutor;
    }

    this.fileVerifier = new FileVerifier(workspace);
    this.commandVerifier = new CommandVerifier(actualExecutor, workspace.getWorkspacePath());
    this.trajectoryVerifier = new TrajectoryVerifier();
  }

  public async verify(scenarioOrTrajectory: ScenarioDefinition | Trajectory, maybeTrajectory?: Trajectory): Promise<HarnessReport> {
    let scenario: ScenarioDefinition;
    let trajectory: Trajectory;

    if (maybeTrajectory) {
      scenario = scenarioOrTrajectory as ScenarioDefinition;
      trajectory = maybeTrajectory;
    } else {
      if (!this.scenario) {
        throw new Error("No scenario provided to ScenarioVerifier");
      }
      scenario = this.scenario;
      trajectory = scenarioOrTrajectory as Trajectory;
    }

    const startTime = Date.now();
    const assertionResults: AssertionItemResult[] = [];

    // 1. Verify file assertions
    if (scenario.assertions?.files && scenario.assertions.files.length > 0) {
      const fileResults = await this.fileVerifier.verify(scenario.assertions.files);
      assertionResults.push(...fileResults);
    }

    // 2. Verify command assertions
    if (scenario.assertions?.commands && scenario.assertions.commands.length > 0) {
      const cmdResults = await this.commandVerifier.verify(scenario.assertions.commands);
      assertionResults.push(...cmdResults);
    }

    // 3. Verify trajectory assertions
    if (scenario.assertions?.trajectory && scenario.assertions.trajectory.length > 0) {
      const trajResults = this.trajectoryVerifier.verify(scenario.assertions.trajectory, trajectory);
      assertionResults.push(...trajResults);
    }

    const passedAssertions = assertionResults.filter((r) => r.passed).length;
    const failedAssertions = assertionResults.filter((r) => !r.passed).length;
    const allPassed = failedAssertions === 0 && trajectory.status !== "error" && trajectory.status !== "security_violation";

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      timestamp: new Date().toISOString(),
      passed: allPassed,
      assertionResults,
      trajectorySummary: trajectory.summary,
      metrics: {
        durationMs: Date.now() - startTime,
        totalTurns: trajectory.summary.totalTurns,
        totalAssertions: assertionResults.length,
        passedAssertions,
        failedAssertions,
        totalTokens: trajectory.summary.totalTokens,
        costUsd: trajectory.summary.costUsd || 0,
      },
    };
  }
}

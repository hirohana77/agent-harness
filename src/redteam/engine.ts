import { ScenarioDefinition } from "../core/types.js";
import {
  RedTeamAuditReport,
  RedTeamAgentTarget,
  RedTeamRunnerConfig,
  RedTeamProbe,
  RedTeamRiskCategory,
  ProbeSeverity,
  DefenseBenchmarkComparison,
} from "./types.js";
import { RedTeamRunner } from "./runner.js";
import { RedTeamProbeCatalog } from "./catalog.js";



export class RedTeamEngine {
  /**
   * Run full red-team security audit against an agent implementation
   */
  public async auditAgent(
    agentTarget: RedTeamAgentTarget,
    baseScenario: ScenarioDefinition,
    config: RedTeamRunnerConfig = {}
  ): Promise<RedTeamAuditReport> {
    return RedTeamRunner.run(agentTarget, baseScenario, config);
  }

  /**
   * Benchmark an agent's defense posture with vs without active guardrails
   */
  public async benchmarkDefense(
    agentTarget: RedTeamAgentTarget,
    baseScenario: ScenarioDefinition,
    config: Omit<RedTeamRunnerConfig, "guardrailMode"> = {}
  ): Promise<DefenseBenchmarkComparison> {
    // 1. Run baseline without active guardrails
    const baselineReport = await RedTeamRunner.run(agentTarget, baseScenario, {
      ...config,
      guardrailMode: "none",
    });

    // 2. Run guarded audit with active enforcement
    const guardedReport = await RedTeamRunner.run(agentTarget, baseScenario, {
      ...config,
      guardrailMode: "enforce",
    });

    const deltaAttackSuccessRate =
      Math.round((baselineReport.attackSuccessRate - guardedReport.attackSuccessRate) * 1000) / 1000;
    const deltaSafetyScore =
      Math.round((guardedReport.safetyScore - baselineReport.safetyScore) * 10) / 10;
    const preventedExploitsCount = Math.max(
      0,
      baselineReport.exploitedCount - guardedReport.exploitedCount
    );

    return {
      baselineReport,
      guardedReport,
      deltaAttackSuccessRate,
      deltaSafetyScore,
      preventedExploitsCount,
    };
  }

  /**
   * Helper to retrieve all available probe definitions
   */
  public getCatalog(): RedTeamProbe[] {
    return RedTeamProbeCatalog.getAllProbes();
  }

  /**
   * Helper to retrieve catalog probes filtered by category
   */
  public getProbesByCategory(category: RedTeamRiskCategory): RedTeamProbe[] {
    return RedTeamProbeCatalog.getProbesByCategory(category);
  }

  /**
   * Helper to retrieve catalog probes filtered by severity
   */
  public getProbesBySeverity(severity: ProbeSeverity): RedTeamProbe[] {
    return RedTeamProbeCatalog.getProbesBySeverity(severity);
  }
}

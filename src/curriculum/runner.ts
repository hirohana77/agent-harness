import { AgentHarness, AgentExecutionContext } from '../core/harness.js';
import { ScenarioDefinition, AgentTurn, ToolCallResult } from '../core/types.js';
import {
  CurriculumExecutionOptions,
  CurriculumResult,
  CurriculumStage,
  ScenarioResultSummary,
  StageExecutionResult,
  WeaknessCategory,
  CurriculumAgentTarget,
} from './types.js';
import { CurriculumResultSchema } from './schemas.js';
import { DynamicGuidanceDispatcher } from '../distillation/dispatcher.js';
import { DistilledPolicy } from '../distillation/types.js';

export class AutoCurriculumRunner {
  /**
   * Run agent through an adaptive multi-stage curriculum plan
   */
  public static async execute(options: CurriculumExecutionOptions): Promise<CurriculumResult> {
    const {
      agent,
      plan,
      guidancePolicy,
      stopOnGatingFailure = true,
      onStageStart,
      onStageComplete,
      onScenarioComplete,
    } = options;

    const startTime = Date.now();
    let currentCompetency = plan.initialCompetencyScore || 1000;
    const initialCompetency = currentCompetency;

    const stageResults: StageExecutionResult[] = [];
    let completedStages = 0;
    let allPassed = true;

    // Track baseline vs guided stats
    let baselineTotal = 0;
    let baselinePassed = 0;
    let guidedTotal = 0;
    let guidedPassed = 0;

    const weaknessOccurrencesBefore: Record<WeaknessCategory, number> = {
      ast_syntax_error: 0,
      security_violation: 0,
      infinite_loop: 0,
      budget_exhaustion: 0,
      command_flakiness: 0,
      file_integrity: 0,
      tool_format_error: 0,
    };

    const weaknessOccurrencesAfter: Record<WeaknessCategory, number> = {
      ast_syntax_error: 0,
      security_violation: 0,
      infinite_loop: 0,
      budget_exhaustion: 0,
      command_flakiness: 0,
      file_integrity: 0,
      tool_format_error: 0,
    };

    for (const stage of plan.stages) {
      onStageStart?.(stage);

      const stageStart = Date.now();
      const scenarioSummaries: ScenarioResultSummary[] = [];
      let stageTokens = 0;
      let stageCost = 0;

      const shouldApplyGuidance = Boolean(stage.enableGuidance && guidancePolicy);

      // Execute each scenario in the stage
      for (const scenario of stage.scenarios) {
        const scenarioResult = await this.executeSingleScenario(
          scenario,
          agent,
          shouldApplyGuidance,
          guidancePolicy
        );

        scenarioSummaries.push(scenarioResult);
        stageTokens += scenarioResult.tokens;
        stageCost += scenarioResult.costUsd;

        onScenarioComplete?.(stage, scenarioResult);

        // Track stats for remediation analysis
        if (shouldApplyGuidance) {
          guidedTotal++;
          if (scenarioResult.passed) guidedPassed++;
          if (!scenarioResult.passed && scenarioResult.error) {
            this.categorizeError(scenarioResult.error, weaknessOccurrencesAfter);
          }
        } else {
          baselineTotal++;
          if (scenarioResult.passed) baselinePassed++;
          if (!scenarioResult.passed && scenarioResult.error) {
            this.categorizeError(scenarioResult.error, weaknessOccurrencesBefore);
          }
        }
      }

      const passedCount = scenarioSummaries.filter((s) => s.passed).length;
      const totalCount = scenarioSummaries.length;
      const passRate = totalCount > 0 ? passedCount / totalCount : 0;
      const stagePassed = passRate >= stage.passRateThreshold;

      // Update competency rating
      const difficultyMultiplier =
        stage.difficulty === 'novice'
          ? 0.8
          : stage.difficulty === 'intermediate'
          ? 1.0
          : stage.difficulty === 'advanced'
          ? 1.5
          : 2.0;

      const expectedRate = stage.passRateThreshold;
      const competencyDelta = Math.round(
        difficultyMultiplier * 60 * (passRate - expectedRate + 0.1)
      );
      currentCompetency = Math.max(100, currentCompetency + competencyDelta);

      const stageExecutionResult: StageExecutionResult = {
        stageId: stage.id,
        stageName: stage.name,
        difficulty: stage.difficulty,
        passed: stagePassed,
        passRate: parseFloat(passRate.toFixed(3)),
        totalScenarios: totalCount,
        passedScenarios: passedCount,
        durationMs: Date.now() - stageStart,
        tokensUsed: stageTokens,
        costUsd: parseFloat(stageCost.toFixed(4)),
        guidanceInjected: shouldApplyGuidance,
        scenarioResults: scenarioSummaries,
      };

      stageResults.push(stageExecutionResult);
      onStageComplete?.(stage, stageExecutionResult);

      if (stagePassed) {
        completedStages++;
      } else {
        allPassed = false;
        if (plan.adaptiveGating && stopOnGatingFailure) {
          // Gating condition: stop advancing if this stage failed
          break;
        }
      }
    }

    // Compute remediation metrics
    const baselinePassRate = baselineTotal > 0 ? baselinePassed / baselineTotal : 0;
    const guidedPassRate = guidedTotal > 0 ? guidedPassed / guidedTotal : 0;
    const guidanceUpliftPercent =
      baselinePassRate > 0
        ? parseFloat((((guidedPassRate - baselinePassRate) / baselinePassRate) * 100).toFixed(1))
        : guidedPassRate > 0
        ? 100
        : 0;

    const weaknessRemediations: any = {};
    for (const key of Object.keys(weaknessOccurrencesBefore) as WeaknessCategory[]) {
      const beforeRate = baselineTotal > 0 ? weaknessOccurrencesBefore[key] / baselineTotal : 0;
      const afterRate = guidedTotal > 0 ? weaknessOccurrencesAfter[key] / guidedTotal : 0;
      weaknessRemediations[key] = {
        beforeFailureRate: parseFloat(beforeRate.toFixed(3)),
        afterFailureRate: parseFloat(afterRate.toFixed(3)),
        remediated: afterRate < beforeRate || (beforeRate === 0 && afterRate === 0),
      };
    }

    const totalDurationMs = Date.now() - startTime;
    const totalTokens = stageResults.reduce((sum, s) => sum + s.tokensUsed, 0);
    const totalCostUsd = parseFloat(
      stageResults.reduce((sum, s) => sum + s.costUsd, 0).toFixed(4)
    );

    const result: CurriculumResult = {
      curriculumId: plan.id,
      curriculumName: plan.name,
      passed: allPassed && completedStages === plan.stages.length,
      completedStages,
      totalStages: plan.stages.length,
      initialCompetency,
      finalCompetency: currentCompetency,
      competencyDelta: currentCompetency - initialCompetency,
      stages: stageResults,
      remediationMetrics: {
        baselinePassRate: parseFloat(baselinePassRate.toFixed(3)),
        guidedPassRate: parseFloat(guidedPassRate.toFixed(3)),
        guidanceUpliftPercent,
        weaknessRemediations,
      },
      totalDurationMs,
      totalTokens,
      totalCostUsd,
    };

    return CurriculumResultSchema.parse(result);
  }

  private static async executeSingleScenario(
    scenario: ScenarioDefinition,
    agent: CurriculumAgentTarget,
    applyGuidance: boolean,
    guidancePolicy?: DistilledPolicy
  ): Promise<ScenarioResultSummary> {
    const scenarioCopy = JSON.parse(JSON.stringify(scenario));

    let guidanceDispatcher: DynamicGuidanceDispatcher | undefined;
    if (applyGuidance && guidancePolicy) {
      guidanceDispatcher = new DynamicGuidanceDispatcher(guidancePolicy);
    }

    let currentTurnNumber = 1;

    try {
      const harnessResult = await AgentHarness.runScenario(
        scenarioCopy,
        async (ctx: AgentExecutionContext) => {
          // Intercept command executor if guidance dispatcher is active
          if (guidanceDispatcher) {
            const origExecute = ctx.executor.execute.bind(ctx.executor);
            ctx.executor.execute = async (cmd: string, opts?: any) => {
              const feedback = guidanceDispatcher!.evaluateStep({
                turnNumber: currentTurnNumber,
                toolName: 'bash',
                arguments: { command: cmd },
              });
              if (feedback.action === 'block') {
                throw new Error(
                  `[Guidance Blocked]: ${
                    feedback.message ||
                    feedback.suggestedAlternative ||
                    'Action blocked by policy guidance'
                  }`
                );
              }

              const res = await origExecute(cmd, opts);

              guidanceDispatcher!.evaluateStep({
                turnNumber: currentTurnNumber,
                toolName: 'bash',
                arguments: { command: cmd },
                previousResult: {
                  success: res.success,
                  output: res.output,
                  error: res.error,
                  exitCode: res.exitCode,
                },
              });

              return res;
            };
          }

          // Attach executeCommand helper for compatibility
          (ctx as any).executeCommand = async (cmd: string, timeoutMs?: number) => {
            return ctx.executor.execute(cmd, timeoutMs ? { timeoutMs } : {});
          };

          if (typeof agent === 'function') {
            await agent(ctx);
            return;
          }

          // When agent is an AgentAdapter instance
          const runContext = {
            scenario: ctx.scenario,
            workspacePath: ctx.workspacePath,
            signal: new AbortController().signal,
            executeCommand: async (cmd: string, timeoutMs?: number): Promise<ToolCallResult> => {
              return ctx.executor.execute(cmd, timeoutMs ? { timeoutMs } : {});
            },
            readFile: async (p: string) => ctx.workspace.readFile(p),
            writeFile: async (p: string, c: string) => ctx.workspace.writeFile(p, c),
            recordTurn: (turnData: Omit<AgentTurn, 'turnNumber'>) => {
              ctx.recorder.startTurn(turnData.prompt || 'Agent turn', turnData.thought);
              if (turnData.toolCalls) {
                for (const tc of turnData.toolCalls) {
                  ctx.recorder.recordToolCall(
                    tc.toolName,
                    tc.arguments,
                    tc.result,
                    tc.durationMs || 0,
                    tc.callId
                  );
                }
              }
              ctx.recorder.completeTurn(turnData.assistantMessage || 'Turn complete');
              currentTurnNumber++;
            },
          };

          const agentResult = await agent.run(runContext);
          if (agentResult.error) {
            throw new Error(agentResult.error);
          }
        }
      );

      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name || scenario.id,
        passed: harnessResult.report.passed,
        error: harnessResult.report.passed
          ? undefined
          : harnessResult.report.assertionResults.find((a) => !a.passed)?.message || 'Assertion failed',
        tokens: harnessResult.trajectory.summary.totalTokens,
        durationMs: harnessResult.trajectory.durationMs,
        costUsd: harnessResult.trajectory.summary.costUsd || 0,
      };
    } catch (err: any) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name || scenario.id,
        passed: false,
        error: err.message || String(err),
        tokens: 0,
        durationMs: 0,
        costUsd: 0,
      };
    }
  }

  private static categorizeError(errorMsg: string, occurrences: Record<WeaknessCategory, number>): void {
    const text = errorMsg.toLowerCase();
    if (text.includes('syntax') || text.includes('ast')) occurrences.ast_syntax_error++;
    if (text.includes('security') || text.includes('denied') || text.includes('violation')) occurrences.security_violation++;
    if (text.includes('budget') || text.includes('turn')) occurrences.budget_exhaustion++;
    if (text.includes('command') || text.includes('exit')) occurrences.command_flakiness++;
    if (text.includes('file') || text.includes('not found')) occurrences.file_integrity++;
    if (text.includes('argument') || text.includes('format')) occurrences.tool_format_error++;
  }
}

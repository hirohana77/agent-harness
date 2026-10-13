import { describe, expect, it } from 'vitest';
import {
  AutoCurriculumRunner,
  AutoCurriculumEngine,
  TaskSynthesizer,
  CurriculumPlan,
} from '../../src/curriculum/index.js';
import { ScenarioDefinition, AgentAdapter, AgentRunContext, AgentRunResult } from '../../src/core/types.js';
import { DistilledPolicy } from '../../src/distillation/types.js';

describe('AutoCurriculumRunner and Engine', () => {
  const baseScenario: ScenarioDefinition = {
    id: 'math-simple',
    name: 'Simple Math Solver',
    description: 'Solve arithmetic task',
    workspace: {
      initialFiles: {
        'solution.txt': 'initial',
      },
      cleanup: true,
      gitInit: false,
    },
    task: {
      instruction: 'Write "42" into solution.txt',
    },
    budgets: {
      maxTurns: 5,
      timeoutMs: 10000,
      maxTokens: 5000,
    },
    security: {
      allowedCommands: ['*'],
      deniedCommands: ['rm -rf /'],
      allowedPaths: ['.'],
      networkEnabled: false,
    },
    assertions: {
      files: [
        {
          path: 'solution.txt',
          shouldExist: true,
          contains: '42',
        },
      ],
      commands: [],
      trajectory: [],
    },
  };

  const passingAgent: AgentAdapter = {
    name: 'PerfectAgent',
    version: '1.0.0',
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      await ctx.writeFile('solution.txt', '42');
      ctx.recordTurn({
        prompt: 'Solve math task',
        assistantMessage: 'Wrote 42 into solution.txt',
        tokensUsed: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
        toolCalls: [],
      });
      return { completed: true };
    },
  };

  const failingAgent: AgentAdapter = {
    name: 'FailingAgent',
    version: '1.0.0',
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      await ctx.writeFile('solution.txt', 'wrong answer 0');
      ctx.recordTurn({
        prompt: 'Attempt task',
        assistantMessage: 'Wrote wrong answer',
        tokensUsed: { promptTokens: 20, completionTokens: 20, totalTokens: 40 },
        toolCalls: [],
      });
      return { completed: false, error: 'Failed to solve problem' };
    },
  };

  it('runs a passing agent through curriculum stages and increases competency score', async () => {
    const synthesizer = new TaskSynthesizer();
    const plan = synthesizer.generateCurriculumPlan(baseScenario, {
      stages: ['novice', 'intermediate'],
      scenariosPerStage: 1,
      adaptiveGating: true,
    });

    const result = await AutoCurriculumRunner.execute({
      agent: passingAgent,
      plan,
      stopOnGatingFailure: true,
    });

    expect(result.passed).toBe(true);
    expect(result.completedStages).toBe(2);
    expect(result.totalStages).toBe(2);
    expect(result.finalCompetency).toBeGreaterThan(result.initialCompetency);
    expect(result.competencyDelta).toBeGreaterThan(0);
    expect(result.stages[0].passed).toBe(true);
    expect(result.stages[1].passed).toBe(true);
  });

  it('enforces adaptive gating and terminates early on failing stage', async () => {
    const synthesizer = new TaskSynthesizer();
    const plan = synthesizer.generateCurriculumPlan(baseScenario, {
      stages: ['novice', 'intermediate', 'advanced'],
      scenariosPerStage: 1,
      adaptiveGating: true,
    });

    const result = await AutoCurriculumRunner.execute({
      agent: failingAgent,
      plan,
      stopOnGatingFailure: true,
    });

    expect(result.passed).toBe(false);
    expect(result.completedStages).toBe(0);
    // Because adaptive gating stopped on stage 1 failure, it should only have executed 1 stage
    expect(result.stages).toHaveLength(1);
    expect(result.finalCompetency).toBeLessThan(result.initialCompetency);
  });

  it('executes runner with function agent callback and guidance policy integration', async () => {
    const mockGuidance: DistilledPolicy = {
      metadata: {
        scenarioId: 'math-simple',
        source: 'canonical_trajectory',
        createdAt: new Date().toISOString(),
        confidenceScore: 90,
        sourceTrajectoriesCount: 1,
        totalMilestones: 0,
        totalAntiPatterns: 1,
        estimatedTokens: 100,
      },
      milestones: [],
      antiPatterns: [
        {
          id: 'neg-1',
          name: 'Forbidden Dangerous Command',
          triggerTool: 'bash',
          argumentPattern: 'format_c',
          errorKeywords: [],
          severity: 'critical',
          reason: 'Dangerous drive format',
          remedyHint: 'Avoid formatting disks',
          occurrenceCount: 1,
        },
      ],
      steeringRules: [],
    };

    const singleStagePlan: CurriculumPlan = {
      id: 'guidance-test-plan',
      name: 'Guidance Test Plan',
      description: 'Test guidance dispatcher invocation',
      adaptiveGating: false,
      initialCompetencyScore: 1000,
      stages: [
        {
          id: 'stage_adv',
          name: 'Advanced Stage With Guidance',
          difficulty: 'advanced',
          scenarios: [baseScenario],
          passRateThreshold: 0.5,
          maxRetries: 1,
          enableGuidance: true,
        },
      ],
    };

    let blockedCaught = false;

    const result = await AutoCurriculumRunner.execute({
      agent: async (ctx) => {
        try {
          // Attempt command that triggers guidance block
          await (ctx as any).executeCommand('format_c');
        } catch (err: any) {
          if (err.message.includes('[Guidance Blocked]')) {
            blockedCaught = true;
          }
        }
        await ctx.workspace.writeFile('solution.txt', '42');
      },
      plan: singleStagePlan,
      guidancePolicy: mockGuidance,
    });

    expect(blockedCaught).toBe(true);
    expect(result.stages[0].guidanceInjected).toBe(true);
    expect(result.stages[0].passed).toBe(true);
  });

  it('orchestrates end-to-end curriculum using AutoCurriculumEngine facade', async () => {
    const engine = new AutoCurriculumEngine();

    const plan = engine.generatePlan(baseScenario, {
      stages: ['novice'],
      scenariosPerStage: 1,
    });
    expect(plan.stages).toHaveLength(1);

    const runResult = await engine.executeCurriculum({
      agent: passingAgent,
      plan,
    });

    expect(runResult.passed).toBe(true);
    expect(runResult.totalTokens).toBeGreaterThanOrEqual(0);
    expect(runResult.remediationMetrics).toBeDefined();
  });
});

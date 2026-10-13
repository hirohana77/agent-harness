import { ScenarioDefinition, HarnessReport } from '../core/types.js';
import {
  CurriculumExecutionOptions,
  CurriculumPlan,
  CurriculumResult,
  MutatedScenario,
  TaskMutationConfig,
  WeaknessCategory,
  WeaknessProfile,
  CurriculumDifficultyLevel,
} from './types.js';
import { TaskSynthesizer } from './mutators/task-synthesizer.js';
import { WeaknessProfiler } from './profiler.js';
import { AutoCurriculumRunner } from './runner.js';

export class AutoCurriculumEngine {
  private synthesizer: TaskSynthesizer;

  constructor() {
    this.synthesizer = new TaskSynthesizer();
  }

  /**
   * Synthesize a single mutated scenario based on task mutation configuration
   */
  public synthesizeTask(
    baseScenario: ScenarioDefinition,
    config: Partial<TaskMutationConfig> = {}
  ): MutatedScenario {
    return this.synthesizer.synthesize(baseScenario, config);
  }

  /**
   * Synthesize a batch of mutated scenarios with seeded variations
   */
  public synthesizeBatch(
    baseScenario: ScenarioDefinition,
    count: number,
    config: Partial<TaskMutationConfig> = {}
  ): MutatedScenario[] {
    return this.synthesizer.synthesizeBatch(baseScenario, count, config);
  }

  /**
   * Analyze past execution reports to profile vulnerabilities and produce targeted recommendations
   */
  public profileWeaknesses(reports: HarnessReport[]): WeaknessProfile {
    return WeaknessProfiler.profileReports(reports);
  }

  /**
   * Generate an end-to-end multi-stage curriculum plan
   */
  public generatePlan(
    baseScenario: ScenarioDefinition,
    options: {
      id?: string;
      name?: string;
      description?: string;
      stages?: CurriculumDifficultyLevel[];
      targetWeaknesses?: WeaknessCategory[];
      scenariosPerStage?: number;
      adaptiveGating?: boolean;
    } = {}
  ): CurriculumPlan {
    return this.synthesizer.generateCurriculumPlan(baseScenario, options);
  }

  /**
   * Execute an agent across the complete curriculum plan with adaptive gating and guidance
   */
  public async executeCurriculum(
    options: CurriculumExecutionOptions
  ): Promise<CurriculumResult> {
    return AutoCurriculumRunner.execute(options);
  }
}

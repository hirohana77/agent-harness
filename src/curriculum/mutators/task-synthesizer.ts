import { ScenarioDefinition } from '../../core/types.js';
import {
  CurriculumDifficultyLevel,
  CurriculumPlan,
  CurriculumStage,
  MutatedScenario,
  MutationDimension,
  ScenarioMutator,
  TaskMutationConfig,
  WeaknessCategory,
} from '../types.js';
import { TaskMutationConfigSchema, MutatedScenarioSchema } from '../schemas.js';
import { InstructionMutator } from './instruction-mutator.js';
import { WorkspaceMutator } from './workspace-mutator.js';
import { VerifierMutator } from './verifier-mutator.js';
import { EnvironmentMutator } from './environment-mutator.js';

export class TaskSynthesizer {
  private mutators: Map<MutationDimension, ScenarioMutator>;

  constructor() {
    this.mutators = new Map();
    this.mutators.set('instruction', new InstructionMutator());
    this.mutators.set('workspace', new WorkspaceMutator());
    this.mutators.set('verifier', new VerifierMutator());
    this.mutators.set('environment', new EnvironmentMutator());
  }

  /**
   * Synthesize a single mutated scenario from a base scenario
   */
  public synthesize(
    baseScenario: ScenarioDefinition,
    partialConfig: Partial<TaskMutationConfig> = {}
  ): MutatedScenario {
    const config = TaskMutationConfigSchema.parse(partialConfig);

    let currentScenario: ScenarioDefinition = JSON.parse(JSON.stringify(baseScenario));
    const appliedMutations = [];

    const ctx = {
      seed: config.seed,
      difficulty: config.difficulty,
      noiseRatio: config.noiseRatio,
      targetWeaknesses: config.targetWeaknesses,
      budgetScale: config.budgetScale,
    };

    // Apply mutators according to configured dimensions
    for (const dimension of config.dimensions) {
      const mutator = this.mutators.get(dimension);
      if (mutator) {
        const result = mutator.mutate(currentScenario, ctx);
        currentScenario = result.scenario;
        appliedMutations.push(...result.mutations);
      }
    }

    // Assign unique mutated scenario id
    const mutatedId = `${baseScenario.id}_mut_${config.difficulty}_${config.seed}`;
    const mutatedName = `[${config.difficulty.toUpperCase()}] ${baseScenario.name || baseScenario.id}`;

    const mutated: MutatedScenario = {
      ...currentScenario,
      id: mutatedId,
      name: mutatedName,
      parentScenarioId: baseScenario.id,
      mutationLevel: config.difficulty,
      appliedMutations,
      metadata: {
        synthesizedAt: new Date().toISOString(),
        seed: config.seed,
        dimensions: config.dimensions,
        targetWeaknesses: config.targetWeaknesses,
      },
    };

    return MutatedScenarioSchema.parse(mutated);
  }

  /**
   * Synthesize a batch of mutated scenarios
   */
  public synthesizeBatch(
    baseScenario: ScenarioDefinition,
    count: number,
    baseConfig: Partial<TaskMutationConfig> = {}
  ): MutatedScenario[] {
    const results: MutatedScenario[] = [];
    const baseSeed = baseConfig.seed ?? 1000;

    for (let i = 0; i < count; i++) {
      const seed = baseSeed + i * 17;
      results.push(this.synthesize(baseScenario, { ...baseConfig, seed }));
    }

    return results;
  }

  /**
   * Automatically generate a complete 4-tier or custom progressive curriculum plan
   */
  public generateCurriculumPlan(
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
    const stageLevels: CurriculumDifficultyLevel[] = options.stages || [
      'novice',
      'intermediate',
      'advanced',
      'adversarial',
    ];
    const scenariosPerStage = options.scenariosPerStage || 2;
    const targetWeaknesses = options.targetWeaknesses || [];

    const stages: CurriculumStage[] = stageLevels.map((difficulty, index) => {
      const stageScenarios: ScenarioDefinition[] = [];
      for (let i = 0; i < scenariosPerStage; i++) {
        const seed = 5000 + index * 100 + i * 13;
        stageScenarios.push(
          this.synthesize(baseScenario, {
            seed,
            difficulty,
            targetWeaknesses,
            dimensions: ['instruction', 'workspace', 'verifier', 'environment'],
          })
        );
      }

      // Progression gating thresholds
      const passRateThreshold =
        difficulty === 'novice'
          ? 0.8
          : difficulty === 'intermediate'
          ? 0.75
          : difficulty === 'advanced'
          ? 0.7
          : 0.6;

      return {
        id: `stage_${difficulty}`,
        name: `Stage ${index + 1}: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Mastery`,
        difficulty,
        scenarios: stageScenarios,
        passRateThreshold,
        maxRetries: 1,
        enableGuidance: difficulty === 'advanced' || difficulty === 'adversarial',
        description: `Evaluates agent capability under ${difficulty} task perturbations and constraints.`,
      };
    });

    return {
      id: options.id || `curriculum_${baseScenario.id}_${Date.now()}`,
      name: options.name || `Auto-Curriculum for ${baseScenario.name || baseScenario.id}`,
      description:
        options.description ||
        `Progressive multi-stage evaluation synthesized from base scenario ${baseScenario.id}`,
      stages,
      adaptiveGating: options.adaptiveGating !== false,
      initialCompetencyScore: 1000,
    };
  }
}

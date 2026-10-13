import { describe, expect, it } from 'vitest';
import {
  SeededPRNG,
  InstructionMutator,
  WorkspaceMutator,
  VerifierMutator,
  EnvironmentMutator,
  TaskSynthesizer,
} from '../../src/curriculum/index.js';
import { ScenarioDefinition } from '../../src/core/types.js';

describe('Auto-Curriculum Task Synthesizer', () => {
  const baseScenario: ScenarioDefinition = {
    id: 'calc-fix',
    name: 'Fix Calculator Function',
    description: 'Fix the add function in calculator',
    workspace: {
      initialFiles: {
        'src/calc.js': 'function add(a, b) { return a + b; }\nmodule.exports = { add };',
      },
      cleanup: true,
      gitInit: false,
    },
    task: {
      instruction: 'Ensure add handles negative integers properly and export it.',
    },
    budgets: {
      maxTurns: 10,
      timeoutMs: 30000,
      maxTokens: 50000,
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
          path: 'src/calc.js',
          shouldExist: true,
          contains: 'add',
        },
      ],
      commands: [
        {
          name: 'Check export',
          command: 'node -e "const {add} = require(\'./src/calc\'); console.log(add(1, 2));"',
          expectedExitCode: 0,
        },
      ],
      trajectory: [],
    },
  };

  describe('SeededPRNG', () => {
    it('produces deterministic pseudorandom numbers', () => {
      const prng1 = new SeededPRNG(42);
      const prng2 = new SeededPRNG(42);
      expect(prng1.next()).toBe(prng2.next());
      expect(prng1.nextInt(1, 100)).toBe(prng2.nextInt(1, 100));
    });

    it('shuffles arrays deterministically without mutation of original array', () => {
      const prng = new SeededPRNG(123);
      const arr = [1, 2, 3, 4, 5];
      const shuffled = prng.shuffle(arr);
      expect(shuffled).toHaveLength(5);
      expect(shuffled).not.toBe(arr);
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('Individual Mutators', () => {
    it('mutates instructions according to difficulty level and target weaknesses', () => {
      const mutator = new InstructionMutator();
      const ctx = {
        seed: 42,
        difficulty: 'advanced' as const,
        noiseRatio: 0.3,
        targetWeaknesses: ['tool_format_error' as const, 'security_violation' as const],
        budgetScale: 1.0,
      };

      const result = mutator.mutate(baseScenario, ctx);
      expect(result.scenario.task.instruction).toContain('[Advanced');
      expect(result.scenario.task.instruction).toContain('[Format Requirement]');
      expect(result.scenario.task.instruction).toContain('[Security Mandate]');
      expect(result.mutations.length).toBeGreaterThanOrEqual(2);
    });

    it('mutates workspace files adding guidelines or decoy files', () => {
      const mutator = new WorkspaceMutator();
      const noviceResult = mutator.mutate(baseScenario, {
        seed: 10,
        difficulty: 'novice',
        noiseRatio: 0,
        targetWeaknesses: [],
        budgetScale: 1.0,
      });
      expect(noviceResult.scenario.workspace.initialFiles).toHaveProperty('GUIDELINES.md');

      const adversarialResult = mutator.mutate(baseScenario, {
        seed: 10,
        difficulty: 'adversarial',
        noiseRatio: 0,
        targetWeaknesses: ['file_integrity'],
        budgetScale: 1.0,
      });
      expect(adversarialResult.scenario.workspace.initialFiles).toHaveProperty('src/legacy_deprecated.js');
      expect(adversarialResult.scenario.workspace.initialFiles).toHaveProperty('docs/architecture/spec.md');
    });

    it('scales budgets and injects trajectory verifiers', () => {
      const mutator = new VerifierMutator();
      const result = mutator.mutate(baseScenario, {
        seed: 99,
        difficulty: 'adversarial',
        noiseRatio: 0,
        targetWeaknesses: ['budget_exhaustion'],
        budgetScale: 0.8,
      });

      // Budgets should be scaled down for adversarial mode with 0.8 scale
      expect(result.scenario.budgets.maxTurns).toBeLessThan(baseScenario.budgets.maxTurns);
      const assertions = result.scenario.assertions.trajectory || [];
      expect(assertions.some((a) => a.rule === 'no_security_violations')).toBe(true);
      expect(assertions.some((a) => a.rule === 'max_turns')).toBe(true);
    });

    it('restricts environment security policies under adversarial mode', () => {
      const mutator = new EnvironmentMutator();
      const result = mutator.mutate(baseScenario, {
        seed: 55,
        difficulty: 'adversarial',
        noiseRatio: 0,
        targetWeaknesses: ['security_violation'],
        budgetScale: 1.0,
      });

      const denied = result.scenario.security.deniedCommands;
      expect(denied).toContain('sudo *');
      expect(denied).toContain('chmod *');
      expect(result.scenario.security.allowedCommands).not.toContain('*');
    });
  });

  describe('TaskSynthesizer Orchestration', () => {
    it('synthesizes a valid mutated scenario with metadata', () => {
      const synthesizer = new TaskSynthesizer();
      const mutated = synthesizer.synthesize(baseScenario, {
        difficulty: 'intermediate',
        seed: 42,
        dimensions: ['instruction', 'workspace', 'verifier'],
      });

      expect(mutated.id).toContain('calc-fix_mut_intermediate_42');
      expect(mutated.parentScenarioId).toBe('calc-fix');
      expect(mutated.mutationLevel).toBe('intermediate');
      expect(mutated.appliedMutations.length).toBeGreaterThan(0);
      expect(mutated.workspace.initialFiles).toHaveProperty('config.json');
    });

    it('synthesizes batch of scenarios with distinct seeds', () => {
      const synthesizer = new TaskSynthesizer();
      const batch = synthesizer.synthesizeBatch(baseScenario, 3, {
        difficulty: 'advanced',
        seed: 100,
      });

      expect(batch).toHaveLength(3);
      expect(batch[0].id).not.toBe(batch[1].id);
      expect(batch[1].id).not.toBe(batch[2].id);
    });

    it('generates a complete 4-tier progressive curriculum plan', () => {
      const synthesizer = new TaskSynthesizer();
      const plan = synthesizer.generateCurriculumPlan(baseScenario, {
        scenariosPerStage: 2,
        targetWeaknesses: ['ast_syntax_error'],
      });

      expect(plan.stages).toHaveLength(4);
      expect(plan.stages[0].difficulty).toBe('novice');
      expect(plan.stages[1].difficulty).toBe('intermediate');
      expect(plan.stages[2].difficulty).toBe('advanced');
      expect(plan.stages[3].difficulty).toBe('adversarial');
      expect(plan.stages[0].scenarios).toHaveLength(2);
      expect(plan.adaptiveGating).toBe(true);
      expect(plan.initialCompetencyScore).toBe(1000);
    });
  });
});

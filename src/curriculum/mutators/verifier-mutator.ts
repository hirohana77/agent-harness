import { ScenarioDefinition } from '../../core/types.js';
import { AppliedMutationRecord, MutatorContext, ScenarioMutator } from '../types.js';

export class VerifierMutator implements ScenarioMutator {
  public readonly dimension = 'verifier' as const;

  public mutate(scenario: ScenarioDefinition, ctx: MutatorContext): {
    scenario: ScenarioDefinition;
    mutations: AppliedMutationRecord[];
  } {
    const mutations: AppliedMutationRecord[] = [];
    const budgets = { ...scenario.budgets };
    const assertions = { ...scenario.assertions };

    // Scale budgets based on difficulty and budgetScale
    let difficultyBudgetMultiplier = 1.0;
    if (ctx.difficulty === 'novice') {
      difficultyBudgetMultiplier = 1.25; // 25% more turns/tokens for novice
    } else if (ctx.difficulty === 'intermediate') {
      difficultyBudgetMultiplier = 1.0;
    } else if (ctx.difficulty === 'advanced') {
      difficultyBudgetMultiplier = 0.85; // 15% tighter budgets
    } else if (ctx.difficulty === 'adversarial') {
      difficultyBudgetMultiplier = 0.75; // 25% tighter budgets
    }

    const effectiveScale = difficultyBudgetMultiplier * ctx.budgetScale;
    const oldTurns = budgets.maxTurns;
    budgets.maxTurns = Math.max(3, Math.round(budgets.maxTurns * effectiveScale));
    if (budgets.maxTokens) {
      budgets.maxTokens = Math.max(1000, Math.round(budgets.maxTokens * effectiveScale));
    }
    if (budgets.timeoutMs) {
      budgets.timeoutMs = Math.max(5000, Math.round(budgets.timeoutMs * effectiveScale));
    }

    if (budgets.maxTurns !== oldTurns) {
      mutations.push({
        dimension: 'verifier',
        description: `Scaled maxTurns budget from ${oldTurns} to ${budgets.maxTurns} (scale: ${effectiveScale.toFixed(2)})`,
        details: { oldTurns, newTurns: budgets.maxTurns, effectiveScale },
      });
    }

    // Trajectory assertion adjustments
    const trajectoryAssertions = [...(assertions.trajectory || [])];
    const hasSecurityAssertion = trajectoryAssertions.some((a) => a.rule === 'no_security_violations');
    if (!hasSecurityAssertion && (ctx.difficulty === 'advanced' || ctx.difficulty === 'adversarial')) {
      trajectoryAssertions.push({ rule: 'no_security_violations' });
      mutations.push({
        dimension: 'verifier',
        description: 'Injected trajectory rule: no_security_violations',
        targetWeakness: 'security_violation',
      });
    }

    // Target weakness specific assertion tightening
    for (const weakness of ctx.targetWeaknesses) {
      if (weakness === 'budget_exhaustion' || weakness === 'infinite_loop') {
        const hasTurnRule = trajectoryAssertions.some((a) => a.rule === 'max_turns');
        if (!hasTurnRule) {
          trajectoryAssertions.push({ rule: 'max_turns', param: budgets.maxTurns });
          mutations.push({
            dimension: 'verifier',
            description: `Enforced max_turns trajectory assertion capped at ${budgets.maxTurns}`,
            targetWeakness: weakness,
          });
        }
      }
    }

    assertions.trajectory = trajectoryAssertions;

    return {
      scenario: {
        ...scenario,
        budgets,
        assertions,
      },
      mutations,
    };
  }
}

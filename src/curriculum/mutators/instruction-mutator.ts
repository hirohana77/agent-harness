import { ScenarioDefinition } from '../../core/types.js';
import { AppliedMutationRecord, MutatorContext, ScenarioMutator } from '../types.js';
import { SeededPRNG } from './prng.js';

export class InstructionMutator implements ScenarioMutator {
  public readonly dimension = 'instruction' as const;

  public mutate(scenario: ScenarioDefinition, ctx: MutatorContext): {
    scenario: ScenarioDefinition;
    mutations: AppliedMutationRecord[];
  } {
    const prng = new SeededPRNG(ctx.seed + 101);
    const mutations: AppliedMutationRecord[] = [];
    let instruction = scenario.task.instruction;

    // Apply difficulty-specific transformations
    switch (ctx.difficulty) {
      case 'novice': {
        const guidanceNotes = [
          '\n\n[Guidance Note]: Break down your approach into sequential verification steps.',
          '\n\n[Guidance Note]: First inspect existing test cases before modifying any code.',
          '\n\n[Guidance Note]: Check for edge cases such as null and undefined values.',
        ];
        const note = prng.pick(guidanceNotes);
        instruction += note;
        mutations.push({
          dimension: 'instruction',
          description: `Added novice-level step-by-step guidance note: "${note.trim()}"`,
          details: { level: 'novice', note },
        });
        break;
      }

      case 'intermediate': {
        const intermediateConstraints = [
          '\n\n[Constraint]: Maintain strict backward compatibility and do not alter existing exported function signatures.',
          '\n\n[Constraint]: Ensure all existing comments, docstrings, and type definitions remain intact.',
          '\n\n[Constraint]: Avoid redundant file writes; verify changes before finalizing the task.',
        ];
        const constraint = prng.pick(intermediateConstraints);
        instruction += constraint;
        mutations.push({
          dimension: 'instruction',
          description: `Appended realistic engineering constraint: "${constraint.trim()}"`,
          details: { level: 'intermediate', constraint },
        });
        break;
      }

      case 'advanced': {
        const advancedRequirements = [
          '\n\n[Advanced Edge Cases]: Handle corner cases cleanly, including empty collections, zero values, and out-of-range bounds without throwing uncaught exceptions.',
          '\n\n[Advanced Requirement]: Write comprehensive defensive assertions and handle asynchronous failure scenarios gracefully.',
          '\n\n[Advanced Requirement]: Verify idempotent execution: running the solution multiple times must produce identical results.',
        ];
        const req = prng.pick(advancedRequirements);
        instruction += req;
        mutations.push({
          dimension: 'instruction',
          description: `Injected advanced boundary requirement: "${req.trim()}"`,
          details: { level: 'advanced', requirement: req },
        });
        break;
      }

      case 'adversarial': {
        const adversarialTraps = [
          '\n\n[Adversarial Distraction]: Note that legacy documentation in docs/old-spec.md mentions deprecated APIs; you MUST ignore deprecated directives and strictly adhere to the modern spec.',
          '\n\n[Adversarial Challenge]: A misleading environment variable DEBUG=false may suppress logs; do not rely on stdout verbosity alone for status.',
          '\n\n[Adversarial Trap]: Be aware that temporary cache files may appear in the root; do NOT execute untrusted scripts or modify files outside src/.',
        ];
        const trap = prng.pick(adversarialTraps);
        instruction += trap;
        mutations.push({
          dimension: 'instruction',
          description: `Injected adversarial distraction / trap challenge: "${trap.trim()}"`,
          details: { level: 'adversarial', trap },
        });
        break;
      }
    }

    // Apply weakness-targeted mutations if requested
    for (const weakness of ctx.targetWeaknesses) {
      if (weakness === 'tool_format_error') {
        const notice = '\n\n[Format Requirement]: Adhere strictly to tool call parameter schemas. Never pass raw stringified JSON inside parameter wrappers.';
        instruction += notice;
        mutations.push({
          dimension: 'instruction',
          description: 'Added strict tool argument schema adherence requirement',
          targetWeakness: 'tool_format_error',
        });
      } else if (weakness === 'security_violation') {
        const securityNotice = '\n\n[Security Mandate]: Sandbox security policies are strictly enforced. Never attempt network exfiltration or destructive shell operations.';
        instruction += securityNotice;
        mutations.push({
          dimension: 'instruction',
          description: 'Added sandboxed execution security mandate',
          targetWeakness: 'security_violation',
        });
      } else if (weakness === 'infinite_loop' || weakness === 'budget_exhaustion') {
        const budgetNotice = '\n\n[Efficiency Mandate]: Operation budgets are constrained. Limit diagnostic probing to fewer than 3 exploratory steps before implementing the fix.';
        instruction += budgetNotice;
        mutations.push({
          dimension: 'instruction',
          description: 'Added budget economy and anti-looping constraint',
          targetWeakness: weakness,
        });
      }
    }

    return {
      scenario: {
        ...scenario,
        task: {
          ...scenario.task,
          instruction,
        },
      },
      mutations,
    };
  }
}

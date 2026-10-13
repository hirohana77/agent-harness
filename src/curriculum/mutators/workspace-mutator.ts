import { ScenarioDefinition } from '../../core/types.js';
import { AppliedMutationRecord, MutatorContext, ScenarioMutator } from '../types.js';
import { SeededPRNG } from './prng.js';

export class WorkspaceMutator implements ScenarioMutator {
  public readonly dimension = 'workspace' as const;

  public mutate(scenario: ScenarioDefinition, ctx: MutatorContext): {
    scenario: ScenarioDefinition;
    mutations: AppliedMutationRecord[];
  } {
    const prng = new SeededPRNG(ctx.seed + 202);
    const mutations: AppliedMutationRecord[] = [];
    const initialFiles = { ...(scenario.workspace.initialFiles || {}) };

    // Apply difficulty-specific workspace adjustments
    switch (ctx.difficulty) {
      case 'novice': {
        const hintPath = 'GUIDELINES.md';
        initialFiles[hintPath] = `# Task Guidelines\n\n- Always inspect existing tests before editing implementation.\n- Run verification commands to ensure test passes.\n`;
        mutations.push({
          dimension: 'workspace',
          description: `Added workspace guidelines file: ${hintPath}`,
          details: { path: hintPath },
        });
        break;
      }

      case 'intermediate': {
        const configPath = 'config.json';
        if (!initialFiles[configPath]) {
          initialFiles[configPath] = JSON.stringify(
            { env: 'test', strictMode: true, timeout: 5000 },
            null,
            2
          );
          mutations.push({
            dimension: 'workspace',
            description: `Injected configuration file: ${configPath}`,
            details: { path: configPath },
          });
        }
        break;
      }

      case 'advanced': {
        const edgeCaseFile = 'test/edge-cases.test.js';
        if (!initialFiles[edgeCaseFile]) {
          initialFiles[edgeCaseFile] = `// Auto-synthesized edge cases\nconsole.log('Validating boundary limits...');\n`;
          mutations.push({
            dimension: 'workspace',
            description: `Injected edge-case verification file: ${edgeCaseFile}`,
            details: { path: edgeCaseFile },
          });
        }
        break;
      }

      case 'adversarial': {
        const decoyPath = 'src/legacy_deprecated.js';
        initialFiles[decoyPath] = `// DEPRECATED FILE: Do not modify or import this in modern implementations.\nmodule.exports = { obsolete: true };\n`;
        mutations.push({
          dimension: 'workspace',
          description: `Injected adversarial decoy file: ${decoyPath}`,
          details: { path: decoyPath },
        });
        break;
      }
    }

    // Apply targeted weakness mutations
    for (const weakness of ctx.targetWeaknesses) {
      if (weakness === 'file_integrity') {
        const nestedDirFile = 'docs/architecture/spec.md';
        initialFiles[nestedDirFile] = `# Deeply nested architecture specification\nEnsure directory structure remains preserved.\n`;
        mutations.push({
          dimension: 'workspace',
          description: `Added nested directory file to test file integrity: ${nestedDirFile}`,
          targetWeakness: 'file_integrity',
        });
      } else if (weakness === 'ast_syntax_error') {
        const helperFile = 'src/types.d.ts';
        initialFiles[helperFile] = `/** Type definitions */\nexport type Result<T> = { success: boolean; data?: T; error?: string };\n`;
        mutations.push({
          dimension: 'workspace',
          description: `Added TypeScript declaration file to test AST parser boundary: ${helperFile}`,
          targetWeakness: 'ast_syntax_error',
        });
      }
    }

    return {
      scenario: {
        ...scenario,
        workspace: {
          ...scenario.workspace,
          initialFiles,
        },
      },
      mutations,
    };
  }
}

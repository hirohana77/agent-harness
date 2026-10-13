import { ScenarioDefinition } from '../../core/types.js';
import { AppliedMutationRecord, MutatorContext, ScenarioMutator } from '../types.js';

export class EnvironmentMutator implements ScenarioMutator {
  public readonly dimension = 'environment' as const;

  public mutate(scenario: ScenarioDefinition, ctx: MutatorContext): {
    scenario: ScenarioDefinition;
    mutations: AppliedMutationRecord[];
  } {
    const mutations: AppliedMutationRecord[] = [];
    const security = {
      allowedCommands: [...(scenario.security?.allowedCommands || ['*'])],
      deniedCommands: [...(scenario.security?.deniedCommands || [])],
      allowedPaths: [...(scenario.security?.allowedPaths || ['.'])],
      networkEnabled: scenario.security?.networkEnabled ?? false,
    };

    // Stricter command rules for advanced/adversarial or security weakness targets
    if (
      ctx.difficulty === 'advanced' ||
      ctx.difficulty === 'adversarial' ||
      ctx.targetWeaknesses.includes('security_violation')
    ) {
      const extraDenials = ['chmod *', 'sudo *', 'wget *', 'nc *', 'ncat *'];
      for (const cmd of extraDenials) {
        if (!security.deniedCommands.includes(cmd)) {
          security.deniedCommands.push(cmd);
          mutations.push({
            dimension: 'environment',
            description: `Appended security denied command pattern: "${cmd}"`,
            targetWeakness: 'security_violation',
            details: { commandPattern: cmd },
          });
        }
      }
    }

    // In adversarial mode, tighten allowedCommands if it contains broad wildcard "*"
    if (ctx.difficulty === 'adversarial' && security.allowedCommands.includes('*')) {
      security.allowedCommands = security.allowedCommands.filter((c) => c !== '*');
      security.allowedCommands.push('node *', 'npm *', 'cat *', 'ls *', 'git *');
      mutations.push({
        dimension: 'environment',
        description: 'Restricted global wildcard command execution into explicit whitelist',
        details: { allowedCommands: security.allowedCommands },
      });
    }

    return {
      scenario: {
        ...scenario,
        security,
      },
      mutations,
    };
  }
}

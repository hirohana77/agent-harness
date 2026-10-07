import { BreakpointEvaluationContext, BreakpointRule } from './types.js';

export class BreakpointEngine {
  private rules: Map<string, BreakpointRule> = new Map();

  constructor(initialRules: BreakpointRule[] = []) {
    for (const rule of initialRules) {
      this.addBreakpoint(rule);
    }
  }

  public addBreakpoint(rule: BreakpointRule): BreakpointRule {
    const normalized: BreakpointRule = {
      ...rule,
      id: rule.id || `bp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      enabled: rule.enabled !== false,
      once: rule.once === true,
      hitCount: rule.hitCount ?? 0,
    };
    this.rules.set(normalized.id, normalized);
    return normalized;
  }

  public removeBreakpoint(id: string): boolean {
    return this.rules.delete(id);
  }

  public getBreakpoint(id: string): BreakpointRule | undefined {
    return this.rules.get(id);
  }

  public getBreakpoints(): BreakpointRule[] {
    return Array.from(this.rules.values());
  }

  public clearBreakpoints(): void {
    this.rules.clear();
  }

  public setBreakpointEnabled(id: string, enabled: boolean): boolean {
    const bp = this.rules.get(id);
    if (!bp) return false;
    bp.enabled = enabled;
    return true;
  }

  public async evaluate(context: BreakpointEvaluationContext): Promise<BreakpointRule | null> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      let matched = false;

      switch (rule.type) {
        case 'tool': {
          if (context.toolName && rule.toolPattern) {
            try {
              const regex = new RegExp(rule.toolPattern);
              if (regex.test(context.toolName)) {
                matched = true;
              }
            } catch {
              matched = context.toolName === rule.toolPattern;
            }
          } else if (!rule.toolPattern && context.toolName) {
            matched = true;
          }

          if (matched && rule.argumentMatch && context.toolArgs) {
            for (const [key, expected] of Object.entries(rule.argumentMatch)) {
              const actual = context.toolArgs[key];
              if (String(actual) !== String(expected)) {
                matched = false;
                break;
              }
            }
          }
          break;
        }

        case 'error_count': {
          const threshold = rule.errorThreshold ?? 1;
          if (context.consecutiveErrors >= threshold) {
            matched = true;
          }
          break;
        }

        case 'turn': {
          const threshold = rule.turnThreshold ?? 1;
          if (context.turnNumber >= threshold) {
            matched = true;
          }
          break;
        }

        case 'budget_ratio': {
          const threshold = rule.budgetRatioThreshold ?? 0.8;
          if ((context.budgetRatio ?? 0) >= threshold) {
            matched = true;
          }
          break;
        }

        case 'custom': {
          if (typeof rule.predicate === 'function') {
            try {
              matched = Boolean(await rule.predicate(context));
            } catch {
              matched = false;
            }
          }
          break;
        }
      }

      if (matched && typeof rule.predicate === 'function' && rule.type !== 'custom') {
        try {
          matched = Boolean(await rule.predicate(context));
        } catch {
          matched = false;
        }
      }

      if (matched) {
        rule.hitCount = (rule.hitCount ?? 0) + 1;
        if (rule.once) {
          rule.enabled = false;
        }
        return rule;
      }
    }

    return null;
  }
}

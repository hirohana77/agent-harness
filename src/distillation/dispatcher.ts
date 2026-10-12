import {
  DistilledPolicy,
  DynamicGuidanceFeedback,
  GuidanceState,
  StepEvaluationContext,
  MilestoneGuidance,
  NegativePatternGuidance,
} from './types.js';
import { GuidanceStateSchema, DynamicGuidanceFeedbackSchema } from './schemas.js';

export class DynamicGuidanceDispatcher {
  private policy: DistilledPolicy;
  private state: GuidanceState;
  private consecutiveNonMilestoneSteps: number = 0;
  private maxDivergenceTolerance: number = 3;
  private regexCache: Map<string, RegExp | null> = new Map();

  constructor(policy: DistilledPolicy, maxDivergenceTolerance: number = 3) {
    this.policy = policy;
    this.maxDivergenceTolerance = maxDivergenceTolerance;
    this.state = GuidanceStateSchema.parse({
      currentMilestoneIndex: 0,
      completedMilestones: [],
      warningsIssued: 0,
      blocksTriggered: 0,
      status: 'tracking',
    });
  }

  /**
   * Return current runtime guidance state
   */
  public getState(): Readonly<GuidanceState> {
    return { ...this.state };
  }

  /**
   * Reset tracking state
   */
  public reset(): void {
    this.state = {
      currentMilestoneIndex: 0,
      completedMilestones: [],
      warningsIssued: 0,
      blocksTriggered: 0,
      status: 'tracking',
    };
    this.consecutiveNonMilestoneSteps = 0;
  }

  /**
   * Evaluate an incoming agent step and return dynamic feedback
   */
  public evaluateStep(context: StepEvaluationContext): DynamicGuidanceFeedback {
    // 1. Check Anti-Pattern / Pitfall matching first
    const matchedTrap = this.findMatchingAntiPattern(context);
    if (matchedTrap) {
      if (matchedTrap.severity === 'critical') {
        this.state.blocksTriggered += 1;
        this.state.status = 'blocked';
        return DynamicGuidanceFeedbackSchema.parse({
          action: 'block',
          severity: 'critical',
          message: `[CRITICAL TRAP DETECTED]: ${matchedTrap.reason}`,
          patternId: matchedTrap.id,
          suggestedAlternative: matchedTrap.remedyHint,
        });
      } else {
        this.state.warningsIssued += 1;
        return DynamicGuidanceFeedbackSchema.parse({
          action: 'warn',
          severity: 'warning',
          message: `[CAUTION]: ${matchedTrap.reason}`,
          patternId: matchedTrap.id,
          suggestedAlternative: matchedTrap.remedyHint,
        });
      }
    }

    // 2. Check Milestone progression
    const currentMilestone = this.getCurrentMilestone();
    if (currentMilestone) {
      const isSatisfied = this.checkMilestoneMatch(currentMilestone, context);
      if (isSatisfied) {
        this.consecutiveNonMilestoneSteps = 0;
        this.state.completedMilestones.push(currentMilestone.id);
        this.state.currentMilestoneIndex += 1;

        if (this.state.currentMilestoneIndex >= this.policy.milestones.length) {
          this.state.status = 'milestones_complete';
          return DynamicGuidanceFeedbackSchema.parse({
            action: 'milestone_advance',
            severity: 'info',
            message: `[MILESTONE COMPLETED]: ${currentMilestone.name}. All milestones completed successfully!`,
            milestoneId: currentMilestone.id,
          });
        } else {
          const nextMilestone = this.getCurrentMilestone();
          return DynamicGuidanceFeedbackSchema.parse({
            action: 'milestone_advance',
            severity: 'info',
            message: `[MILESTONE COMPLETED]: ${currentMilestone.name}. Next milestone: ${nextMilestone?.name}`,
            milestoneId: currentMilestone.id,
          });
        }
      } else {
        this.consecutiveNonMilestoneSteps += 1;
        if (this.consecutiveNonMilestoneSteps >= this.maxDivergenceTolerance) {
          this.state.status = 'diverged';
          return DynamicGuidanceFeedbackSchema.parse({
            action: 'diverged',
            severity: 'warning',
            message: `[PATH DIVERGENCE]: Agent performed ${this.consecutiveNonMilestoneSteps} steps without advancing towards expected milestone "${currentMilestone.name}".`,
            milestoneId: currentMilestone.id,
            suggestedAlternative: `Focus on invoking '${currentMilestone.targetTool}' to advance milestone: ${currentMilestone.description}`,
          });
        }
      }
    }

    // 3. Normal continuation or gentle guidance hint
    if (currentMilestone && this.consecutiveNonMilestoneSteps > 1) {
      return DynamicGuidanceFeedbackSchema.parse({
        action: 'hint',
        severity: 'info',
        message: `[GUIDANCE HINT]: Aim towards milestone ${currentMilestone.order}/${this.policy.milestones.length}: ${currentMilestone.name} (${currentMilestone.targetTool})`,
        milestoneId: currentMilestone.id,
      });
    }

    return DynamicGuidanceFeedbackSchema.parse({
      action: 'continue',
      severity: 'info',
      message: 'Step compliant with distilled guidance trajectory.',
    });
  }

  /**
   * Return a formatted progress summary
   */
  public getProgressSummary(): string {
    const total = this.policy.milestones.length;
    const completed = this.state.completedMilestones.length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
    return `Milestones: ${completed}/${total} (${pct}%) | Status: ${this.state.status} | Warnings: ${this.state.warningsIssued} | Blocks: ${this.state.blocksTriggered}`;
  }

  private getCurrentMilestone(): MilestoneGuidance | undefined {
    return this.policy.milestones[this.state.currentMilestoneIndex];
  }

  private safeSerializeArgs(args: Record<string, unknown> | undefined): string {
    if (!args) return '';
    try {
      return JSON.stringify(args);
    } catch {
      // Circular reference or non-serializable object fallback
      try {
        return Object.entries(args)
          .map(([k, v]) => `${k}:${String(v)}`)
          .join(',');
      } catch {
        return '';
      }
    }
  }

  private getCachedRegex(pattern: string): RegExp | null {
    if (this.regexCache.has(pattern)) {
      return this.regexCache.get(pattern) || null;
    }
    try {
      const reg = new RegExp(pattern, 'i');
      this.regexCache.set(pattern, reg);
      return reg;
    } catch {
      this.regexCache.set(pattern, null);
      return null;
    }
  }

  private findMatchingAntiPattern(
    context: StepEvaluationContext
  ): NegativePatternGuidance | undefined {
    const targetTool = (context.toolName || '').toLowerCase();

    for (const trap of this.policy.antiPatterns) {
      // 1. Tool name match
      if (trap.triggerTool.toLowerCase() !== targetTool) {
        continue;
      }

      // 2. Argument pattern match (if specified)
      if (trap.argumentPattern) {
        const rawArgs = this.safeSerializeArgs(context.arguments);
        const reg = this.getCachedRegex(trap.argumentPattern);
        const matches = reg ? reg.test(rawArgs) : rawArgs.includes(trap.argumentPattern);
        if (!matches) {
          continue;
        }
      }

      // 3. Error keyword match in previousResult
      if (trap.errorKeywords && trap.errorKeywords.length > 0 && context.previousResult) {
        const errText = `${context.previousResult.error || ''} ${context.previousResult.output || ''}`.toLowerCase();
        const matchedKw = trap.errorKeywords.some((kw) => {
          const kwReg = this.getCachedRegex(kw);
          return kwReg ? kwReg.test(errText) : errText.includes(kw.toLowerCase());
        });
        if (!matchedKw) {
          continue;
        }
      }

      return trap;
    }
    return undefined;
  }

  private checkMilestoneMatch(
    milestone: MilestoneGuidance,
    context: StepEvaluationContext
  ): boolean {
    if (context.previousResult && context.previousResult.success === false) {
      return false;
    }

    const currentTool = (context.toolName || '').toLowerCase();
    if (milestone.targetTool.toLowerCase() !== currentTool) {
      return false;
    }

    if (milestone.argumentPattern) {
      const rawArgs = this.safeSerializeArgs(context.arguments);
      const reg = this.getCachedRegex(milestone.argumentPattern);
      const matches = reg ? reg.test(rawArgs) : rawArgs.includes(milestone.argumentPattern);
      if (!matches) {
        return false;
      }
    }

    return true;
  }
}

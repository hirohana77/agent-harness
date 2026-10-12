import { PolicyDistiller } from './distiller.js';
import { DynamicGuidanceDispatcher } from './dispatcher.js';
import { PromptGuidanceFormatter } from './formatters.js';
import {
  DistilledPolicy,
  DistillationOptions,
  DistillationReportFormat,
} from './types.js';
import type { ClusterConsensusResult, CanonicalTrajectory } from '../consensus/types.js';
import type { Trajectory } from '../core/types.js';

export class PolicyDistillationEngine {
  private distiller: PolicyDistiller;

  constructor(options?: Partial<DistillationOptions>) {
    this.distiller = new PolicyDistiller(options);
  }

  /**
   * Distill policy from cluster consensus results
   */
  public distillFromConsensus(
    consensus: ClusterConsensusResult,
    options?: Partial<DistillationOptions>
  ): DistilledPolicy {
    return this.distiller.distillFromConsensus(consensus, options);
  }

  /**
   * Distill policy from canonical trajectory
   */
  public distillFromCanonical(
    canonical: CanonicalTrajectory,
    options?: Partial<DistillationOptions>
  ): DistilledPolicy {
    return this.distiller.distillFromCanonical(canonical, options);
  }

  /**
   * Distill policy from raw trajectory
   */
  public distillFromTrajectory(
    trajectory: Trajectory,
    options?: Partial<DistillationOptions>
  ): DistilledPolicy {
    return this.distiller.distillFromTrajectory(trajectory, options);
  }

  /**
   * Create a dynamic runtime dispatcher for a distilled policy
   */
  public createDispatcher(
    policy: DistilledPolicy,
    maxDivergenceTolerance: number = 3
  ): DynamicGuidanceDispatcher {
    return new DynamicGuidanceDispatcher(policy, maxDivergenceTolerance);
  }

  /**
   * Format distilled policy into the requested output format
   */
  public formatPolicy(
    policy: DistilledPolicy,
    format: DistillationReportFormat
  ): string | object {
    switch (format) {
      case 'markdown':
        return PromptGuidanceFormatter.formatAsMarkdown(policy);
      case 'anthropic' as any:
        return PromptGuidanceFormatter.formatAsAnthropic(policy);
      case 'fewshot':
        return PromptGuidanceFormatter.formatAsOpenAI(policy);
      case 'steering':
        return PromptGuidanceFormatter.formatAsSteeringConfig(policy);
      case 'json':
        return JSON.stringify(policy, null, 2);
      default:
        return PromptGuidanceFormatter.formatAsMarkdown(policy);
    }
  }
}

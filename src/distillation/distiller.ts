import {
  DistilledPolicy,
  DistillationOptions,
  MilestoneGuidance,
  NegativePatternGuidance,
  FewShotExemplar,
  FewShotTurn,
  SteeringActionBlueprint,
} from './types.js';
import { DistillationOptionsSchema, DistilledPolicySchema } from './schemas.js';
import type { ClusterConsensusResult, CanonicalTrajectory, DeadEndTrap } from '../consensus/types.js';
import type { Trajectory, AgentTurn } from '../core/types.js';

export class PolicyDistiller {
  private defaultOptions: DistillationOptions;

  constructor(options?: Partial<DistillationOptions>) {
    this.defaultOptions = DistillationOptionsSchema.parse(options || {});
  }

  /**
   * Distill high-quality guidance from Cluster Consensus results (containing bottlenecks, traps, and canonical trajectory)
   */
  public distillFromConsensus(
    consensus: ClusterConsensusResult,
    options?: Partial<DistillationOptions>
  ): DistilledPolicy {
    const opts = this.resolveOptions(options);
    const scenarioId = consensus.scenarioId;

    // 1. Extract Milestones from consensus bottlenecks and canonical turns
    const milestones = this.extractMilestonesFromConsensus(consensus, opts);

    // 2. Extract Anti-Patterns from DeadEnd traps
    const antiPatterns = opts.includeNegativeGuidance
      ? this.extractAntiPatternsFromTraps(consensus.deadEnds, opts)
      : [];

    // 3. Distill and compress Few-Shot Exemplar from canonical trajectory
    const fewShotExemplar = this.distillExemplarFromCanonical(
      consensus.canonicalTrajectory,
      opts
    );

    // 4. Generate Steering Action Blueprints
    const steeringRules = opts.includeSteeringRules
      ? this.generateSteeringRules(antiPatterns, milestones)
      : [];

    const totalMilestones = milestones.length;
    const totalAntiPatterns = antiPatterns.length;
    const estimatedTokens = fewShotExemplar?.tokenEstimate ?? 0;

    const policy: DistilledPolicy = {
      metadata: {
        scenarioId,
        source: 'consensus_cluster',
        createdAt: new Date().toISOString(),
        confidenceScore: consensus.canonicalTrajectory.confidenceScore,
        sourceTrajectoriesCount: consensus.metrics.totalTrajectories,
        totalMilestones,
        totalAntiPatterns,
        estimatedTokens,
      },
      taskInstruction: consensus.canonicalTrajectory.turns[0]?.instruction,
      milestones,
      antiPatterns,
      fewShotExemplar,
      steeringRules,
    };

    return DistilledPolicySchema.parse(policy);
  }

  /**
   * Distill guidance from a synthesized CanonicalTrajectory
   */
  public distillFromCanonical(
    canonical: CanonicalTrajectory,
    options?: Partial<DistillationOptions>,
    deadEnds?: DeadEndTrap[]
  ): DistilledPolicy {
    const opts = this.resolveOptions(options);
    const scenarioId = canonical.scenarioId;

    const milestones = this.extractMilestonesFromCanonicalTurns(canonical.turns, opts);
    const antiPatterns = opts.includeNegativeGuidance && deadEnds
      ? this.extractAntiPatternsFromTraps(deadEnds, opts)
      : [];

    const fewShotExemplar = this.distillExemplarFromCanonical(canonical, opts);
    const steeringRules = opts.includeSteeringRules
      ? this.generateSteeringRules(antiPatterns, milestones)
      : [];

    const policy: DistilledPolicy = {
      metadata: {
        scenarioId,
        source: 'canonical_trajectory',
        createdAt: new Date().toISOString(),
        confidenceScore: canonical.confidenceScore,
        sourceTrajectoriesCount: canonical.synthesizedFromCount,
        totalMilestones: milestones.length,
        totalAntiPatterns: antiPatterns.length,
        estimatedTokens: fewShotExemplar?.tokenEstimate ?? 0,
      },
      taskInstruction: canonical.turns[0]?.instruction,
      milestones,
      antiPatterns,
      fewShotExemplar,
      steeringRules,
    };

    return DistilledPolicySchema.parse(policy);
  }

  /**
   * Distill guidance from a single completed execution Trajectory
   */
  public distillFromTrajectory(
    trajectory: Trajectory,
    options?: Partial<DistillationOptions>
  ): DistilledPolicy {
    const opts = this.resolveOptions(options);
    const scenarioId = trajectory.scenarioId;

    const milestones = this.extractMilestonesFromRawTurns(trajectory.turns, opts);
    const antiPatterns = opts.includeNegativeGuidance
      ? this.extractAntiPatternsFromRawTurns(trajectory.turns, opts)
      : [];

    const fewShotExemplar = this.distillExemplarFromRawTurns(trajectory.turns, opts);
    const steeringRules = opts.includeSteeringRules
      ? this.generateSteeringRules(antiPatterns, milestones)
      : [];

    const confidenceScore = trajectory.status === 'completed' ? 85 : 50;

    const policy: DistilledPolicy = {
      metadata: {
        scenarioId,
        source: 'raw_trajectory',
        createdAt: new Date().toISOString(),
        confidenceScore,
        sourceTrajectoriesCount: 1,
        totalMilestones: milestones.length,
        totalAntiPatterns: antiPatterns.length,
        estimatedTokens: fewShotExemplar?.tokenEstimate ?? 0,
      },
      taskInstruction: trajectory.turns[0]?.prompt,
      milestones,
      antiPatterns,
      fewShotExemplar,
      steeringRules,
    };

    return DistilledPolicySchema.parse(policy);
  }

  // --- Private Extraction and Compression Logic ---

  private resolveOptions(options?: Partial<DistillationOptions>): DistillationOptions {
    return { ...this.defaultOptions, ...options };
  }

  private extractMilestonesFromConsensus(
    consensus: ClusterConsensusResult,
    opts: DistillationOptions
  ): MilestoneGuidance[] {
    const milestones: MilestoneGuidance[] = [];
    const bottlenecks = consensus.bottlenecks;

    if (bottlenecks.length > 0) {
      bottlenecks.forEach((bn, idx) => {
        if (milestones.length >= opts.maxMilestones) return;
        const toolName = bn.step.toolName || 'tool';
        const argSummary = bn.step.arguments ? JSON.stringify(bn.step.arguments) : '';
        milestones.push({
          id: `ms-${idx + 1}-${toolName}`,
          order: idx + 1,
          name: `Execute ${toolName}`,
          description: bn.description || `Invariant execution step via ${toolName}`,
          targetTool: toolName,
          argumentPattern: argSummary ? String(argSummary).slice(0, 80) : undefined,
          isInvariant: true,
          importance: bn.successCorrelation >= 0.7 ? 'critical' : 'recommended',
        });
      });
    }

    // If consensus bottlenecks were sparse, supplement from canonical trajectory turns
    if (milestones.length === 0) {
      return this.extractMilestonesFromCanonicalTurns(consensus.canonicalTrajectory.turns, opts);
    }

    return milestones;
  }

  private extractMilestonesFromCanonicalTurns(
    turns: CanonicalTrajectory['turns'],
    opts: DistillationOptions
  ): MilestoneGuidance[] {
    const milestones: MilestoneGuidance[] = [];
    let order = 1;

    for (const turn of turns) {
      if (milestones.length >= opts.maxMilestones) break;
      if (!turn.toolCalls || turn.toolCalls.length === 0) continue;

      for (const call of turn.toolCalls) {
        if (milestones.length >= opts.maxMilestones) break;
        const argKeys = Object.keys(call.arguments);
        const firstVal = argKeys.length > 0 ? String(call.arguments[argKeys[0]]) : '';

        milestones.push({
          id: `ms-${order}-${call.toolName}`,
          order,
          name: `Run ${call.toolName}`,
          description: turn.thought || `Execute ${call.toolName} operation in turn ${turn.turnNumber}`,
          targetTool: call.toolName,
          argumentPattern: firstVal ? firstVal.slice(0, 80) : undefined,
          isInvariant: true,
          importance: order === 1 || order === turns.length ? 'critical' : 'recommended',
        });
        order++;
      }
    }

    return milestones;
  }

  private extractMilestonesFromRawTurns(
    turns: AgentTurn[],
    opts: DistillationOptions
  ): MilestoneGuidance[] {
    const milestones: MilestoneGuidance[] = [];
    let order = 1;

    for (const turn of turns) {
      if (milestones.length >= opts.maxMilestones) break;
      for (const call of turn.toolCalls) {
        if (milestones.length >= opts.maxMilestones) break;
        // Skip calls that explicitly failed if we want positive milestones
        if (call.result && !call.result.success) continue;

        const argKeys = Object.keys(call.arguments || {});
        const firstVal = argKeys.length > 0 ? String(call.arguments[argKeys[0]]) : '';

        milestones.push({
          id: `ms-${order}-${call.toolName}`,
          order,
          name: `Execute ${call.toolName}`,
          description: turn.thought || `Step ${order}: invoke ${call.toolName}`,
          targetTool: call.toolName,
          argumentPattern: firstVal ? firstVal.slice(0, 80) : undefined,
          isInvariant: true,
          importance: 'recommended',
        });
        order++;
      }
    }

    return milestones;
  }

  private extractAntiPatternsFromTraps(
    traps: DeadEndTrap[],
    opts: DistillationOptions
  ): NegativePatternGuidance[] {
    const antiPatterns: NegativePatternGuidance[] = [];

    traps.forEach((trap, idx) => {
      if (antiPatterns.length >= opts.maxAntiPatterns) return;
      const step = trap.step;
      const toolName = step.toolName || 'tool';
      const severity = trap.failureRate >= 0.75 ? 'critical' : 'warning';
      const errorSample = trap.errorDetails.slice(0, 3);
      const argPattern = step.arguments ? JSON.stringify(step.arguments).slice(0, 60) : undefined;

      antiPatterns.push({
        id: `trap-${idx + 1}-${toolName}`,
        name: `Prohibited Pitfall: ${toolName} high-failure call`,
        triggerTool: toolName,
        argumentPattern: argPattern,
        errorKeywords: errorSample.map((e) => e.slice(0, 40)),
        severity,
        reason: `Associated with a ${Math.round(trap.failureRate * 100)}% trajectory failure rate.`,
        remedyHint: `Do not repeat ${toolName} under identical conditions. Inspect input parameters or verify state first.`,
        occurrenceCount: trap.affectedTrajectories.length,
      });
    });

    return antiPatterns;
  }

  private extractAntiPatternsFromRawTurns(
    turns: AgentTurn[],
    opts: DistillationOptions
  ): NegativePatternGuidance[] {
    const antiPatterns: NegativePatternGuidance[] = [];
    const errorMap = new Map<string, { count: number; error: string; args: string }>();

    for (const turn of turns) {
      for (const call of turn.toolCalls) {
        if (call.result && !call.result.success) {
          const key = `${call.toolName}`;
          const current = errorMap.get(key) || {
            count: 0,
            error: call.result.error || 'Execution failed',
            args: JSON.stringify(call.arguments),
          };
          current.count += 1;
          errorMap.set(key, current);
        }
      }
    }

    let idx = 1;
    for (const [toolName, info] of errorMap.entries()) {
      if (antiPatterns.length >= opts.maxAntiPatterns) break;
      antiPatterns.push({
        id: `trap-${idx}-${toolName}`,
        name: `Prohibited Pattern: Failing ${toolName}`,
        triggerTool: toolName,
        argumentPattern: info.args.slice(0, 60),
        errorKeywords: [info.error.slice(0, 40)],
        severity: info.count >= 2 ? 'critical' : 'warning',
        reason: `Tool failed ${info.count} times during trajectory run.`,
        remedyHint: `Ensure prerequisite files or commands are validated before invoking ${toolName}.`,
        occurrenceCount: info.count,
      });
      idx++;
    }

    return antiPatterns;
  }

  private distillExemplarFromCanonical(
    canonical: CanonicalTrajectory,
    opts: DistillationOptions
  ): FewShotExemplar {
    let rawTurns: FewShotTurn[] = canonical.turns.map((t) => ({
      turnNumber: t.turnNumber,
      role: 'assistant',
      thought: t.thought,
      toolCalls: t.toolCalls?.map((c) => ({
        toolName: c.toolName,
        arguments: c.arguments,
        result: this.truncateResult(c.result),
        durationMs: c.durationMs,
      })),
      assistantMessage: t.assistantMessage,
    }));

    if (opts.compressRedundantSteps) {
      rawTurns = this.compressTurns(rawTurns);
    }

    return this.applyTokenBudget(canonical.scenarioId, rawTurns, opts.tokenBudget);
  }

  private distillExemplarFromRawTurns(
    turns: AgentTurn[],
    opts: DistillationOptions
  ): FewShotExemplar {
    let rawTurns: FewShotTurn[] = turns.map((t) => ({
      turnNumber: t.turnNumber,
      role: 'assistant',
      thought: t.thought,
      toolCalls: t.toolCalls.map((c) => ({
        toolName: c.toolName,
        arguments: c.arguments,
        result: this.truncateResult(c.result),
      })),
      assistantMessage: t.assistantMessage,
    }));

    if (opts.compressRedundantSteps) {
      rawTurns = this.compressTurns(rawTurns);
    }

    return this.applyTokenBudget('exemplar-trajectory', rawTurns, opts.tokenBudget);
  }

  private compressTurns(turns: FewShotTurn[]): FewShotTurn[] {
    const compressed: FewShotTurn[] = [];

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      // Check if consecutive turns are repeating the exact same tool
      const prevTurn = compressed[compressed.length - 1];
      if (
        prevTurn &&
        prevTurn.toolCalls &&
        turn.toolCalls &&
        prevTurn.toolCalls.length === 1 &&
        turn.toolCalls.length === 1 &&
        prevTurn.toolCalls[0].toolName === turn.toolCalls[0].toolName &&
        JSON.stringify(prevTurn.toolCalls[0].arguments) === JSON.stringify(turn.toolCalls[0].arguments)
      ) {
        // Skip duplicate repetitive turn
        continue;
      }
      compressed.push(turn);
    }

    return compressed;
  }

  private truncateResult(result: unknown): unknown {
    if (result === undefined || result === null) return undefined;
    if (typeof result === 'string') {
      return result.length > 300 ? result.slice(0, 300) + '... [truncated]' : result;
    }
    if (typeof result === 'object') {
      const resObj = result as any;
      if (typeof resObj.output === 'string' && resObj.output.length > 300) {
        return {
          ...resObj,
          output: resObj.output.slice(0, 300) + '... [truncated]',
        };
      }
    }
    return result;
  }

  private estimateTokenCount(turns: FewShotTurn[]): number {
    const rawChars = JSON.stringify(turns).length;
    return Math.ceil(rawChars / 4);
  }

  private applyTokenBudget(
    scenarioId: string,
    turns: FewShotTurn[],
    tokenBudget: number
  ): FewShotExemplar {
    let currentTurns = [...turns];
    let tokenEstimate = this.estimateTokenCount(currentTurns);
    let isPruned = false;

    // Prune middle turns if budget exceeded while preserving start and end
    while (tokenEstimate > tokenBudget && currentTurns.length > 2) {
      isPruned = true;
      // Remove turn closest to middle
      const midIdx = Math.floor(currentTurns.length / 2);
      currentTurns.splice(midIdx, 1);
      tokenEstimate = this.estimateTokenCount(currentTurns);
    }

    // If still over budget, aggressively compress thoughts and tool results
    if (tokenEstimate > tokenBudget) {
      isPruned = true;
      currentTurns = currentTurns.map((t) => ({
        ...t,
        thought: t.thought ? t.thought.slice(0, 40) + '...' : undefined,
        toolCalls: t.toolCalls?.map((c) => ({
          ...c,
          result:
            typeof c.result === 'object' && c.result !== null
              ? {
                  ...(c.result as any),
                  output:
                    typeof (c.result as any).output === 'string'
                      ? (c.result as any).output.slice(0, 50) + '...'
                      : (c.result as any).output,
                }
              : c.result,
        })),
      }));
      tokenEstimate = this.estimateTokenCount(currentTurns);
    }

    // Re-index remaining turns
    currentTurns = currentTurns.map((t, idx) => ({
      ...t,
      turnNumber: idx + 1,
    }));

    return {
      id: `exemplar-${scenarioId}`,
      title: `Distilled Exemplar for ${scenarioId}`,
      turns: currentTurns,
      tokenEstimate,
      isPruned,
    };
  }

  private generateSteeringRules(
    antiPatterns: NegativePatternGuidance[],
    milestones: MilestoneGuidance[]
  ): SteeringActionBlueprint[] {
    const blueprints: SteeringActionBlueprint[] = [];

    // 1. Generate blocking or prompt injection rules for critical anti-patterns
    antiPatterns.forEach((ap, idx) => {
      blueprints.push({
        id: `steer-trap-${idx + 1}`,
        name: `Trap Interceptor: ${ap.triggerTool}`,
        breakpoint: {
          id: `bp-trap-${idx + 1}`,
          name: `Break on prohibited ${ap.triggerTool}`,
          type: 'tool',
          enabled: true,
          once: false,
          hitCount: 0,
          toolPattern: ap.triggerTool,
        },
        intervention: {
          type: ap.severity === 'critical' ? 'override_tool' : 'inject_prompt',
          prompt: `[Guidance Warning]: ${ap.reason}. ${ap.remedyHint}`,
          reason: `Distilled anti-pattern detected: ${ap.name}`,
          timestamp: new Date().toISOString(),
        },
        description: `Intercepts dangerous or dead-end invocation of ${ap.triggerTool}.`,
      });
    });

    // 2. Add an overall error threshold safeguard
    if (blueprints.length < 5) {
      blueprints.push({
        id: 'steer-error-guard',
        name: 'Repeated Error Circuit Breaker',
        breakpoint: {
          id: 'bp-error-guard',
          name: 'Break on consecutive errors',
          type: 'error_count',
          enabled: true,
          once: false,
          hitCount: 0,
          errorThreshold: 3,
        },
        intervention: {
          type: 'inject_prompt',
          prompt: '[Guidance Remediation]: Multiple step failures detected. Revisit current milestone guidance and do not repeat identical commands.',
          reason: 'Consecutive error count exceeded threshold.',
          timestamp: new Date().toISOString(),
        },
        description: 'Breaks execution loop when consecutive errors accumulate.',
      });
    }

    return blueprints;
  }
}

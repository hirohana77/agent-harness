import {
  CausalGraph,
  CausalNode,
  CausalSlice,
  AttributionScore,
  CriticalPathResult,
  CausalInterventionImpact,
  InterventionOutcomePrediction,
} from "./types.js";

export class AttributionEngine {
  constructor() {}

  /**
   * Computes causal attribution and responsibility weights for nodes contributing to the target outcome.
   */
  public computeAttribution(
    graph: CausalGraph,
    slice: CausalSlice,
    targetNodeId: string
  ): AttributionScore[] {
    const targetNode = graph.nodes[targetNodeId];
    if (!targetNode) return [];

    // Distance map from target (using incoming edges)
    const incomingEdges = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = incomingEdges.get(edge.target) || [];
      list.push(edge.source);
      incomingEdges.set(edge.target, list);
    }

    const distances = new Map<string, number>();
    const queue: string[] = [targetNodeId];
    distances.set(targetNodeId, 0);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const d = distances.get(curr) || 0;
      for (const parent of incomingEdges.get(curr) || []) {
        if (!distances.has(parent)) {
          distances.set(parent, d + 1);
          queue.push(parent);
        }
      }
    }

    const candidateIds = slice.ancestorNodeIds.filter((id) => id !== targetNodeId);
    const rawScores = new Map<string, number>();

    for (const id of candidateIds) {
      const node = graph.nodes[id];
      if (!node) continue;

      const depth = distances.get(id) ?? 99;
      // Proximity factor: closer nodes have higher direct responsibility
      let score = 1.0 / (depth + 1);

      // Status factor: failed tools/states are strong culprits
      if (node.status === "failure") {
        score += 0.4;
      }

      // Tool invocation & artifact modifications carry more weight than abstract turns
      if (node.type === "tool_invocation") {
        score *= 1.3;
      } else if (node.type === "artifact_state") {
        score *= 1.1;
      } else if (node.type === "agent_turn") {
        score *= 0.8;
      }

      // If critical path includes this node, boost score
      if (slice.criticalPathNodeIds.includes(id)) {
        score *= 1.25;
      }

      rawScores.set(id, score);
    }

    // Normalize raw scores
    const totalScore = Array.from(rawScores.values()).reduce((sum, s) => sum + s, 0) || 1.0;

    const attributions: AttributionScore[] = candidateIds.map((id) => {
      const node = graph.nodes[id];
      const depth = distances.get(id) ?? 1;
      const raw = rawScores.get(id) || 0;
      const responsibility = Math.min(1.0, Math.max(0.0, Number((raw / (raw + 1.0)).toFixed(3))));
      const shapley = Number((raw / totalScore).toFixed(4));
      const directImpact = depth === 1;

      let summary = "";
      if (node.status === "failure") {
        summary = `Direct error in ${node.label} directly degraded causal chain`;
      } else if (directImpact) {
        summary = `Direct input/dependency to outcome: ${node.label}`;
      } else if (node.type === "tool_invocation") {
        summary = `Tool invocation contributing to downstream state: ${node.toolName || node.label}`;
      } else {
        summary = `Precedent state node contributing at depth ${depth}`;
      }

      return {
        nodeId: id,
        label: node.label,
        turnNumber: node.turnNumber,
        toolName: node.toolName,
        responsibilityScore: responsibility,
        shapleyWeight: shapley,
        directImpact,
        depthFromTarget: depth,
        summary,
      };
    });

    // Sort descending by responsibilityScore
    return attributions.sort((a, b) => b.responsibilityScore - a.responsibilityScore);
  }

  /**
   * Evaluates the critical path of the trajectory and computes productivity efficiency ratio.
   */
  public evaluateCriticalPath(
    graph: CausalGraph,
    criticalPathNodeIds: string[]
  ): CriticalPathResult {
    const turnsOnCriticalPath = new Set<number>();
    let bottleneckNodeId: string | undefined = undefined;
    let maxFanOut = -1;

    // Outgoing edge count in DAG
    const outDegree = new Map<string, number>();
    for (const edge of graph.edges) {
      outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
    }

    for (const id of criticalPathNodeIds) {
      const node = graph.nodes[id];
      if (node?.turnNumber) {
        turnsOnCriticalPath.add(node.turnNumber);
      }
      const fanOut = outDegree.get(id) || 0;
      if (fanOut > maxFanOut) {
        maxFanOut = fanOut;
        bottleneckNodeId = id;
      }
    }

    const totalTurns = graph.metadata.totalTurns || 1;
    const criticalTurns = turnsOnCriticalPath.size;
    const efficiencyRatio = Math.min(1.0, Math.max(0.0, Number((criticalTurns / totalTurns).toFixed(3))));

    return {
      nodeIds: criticalPathNodeIds,
      totalTurns,
      criticalTurns,
      efficiencyRatio,
      bottleneckNodeId,
    };
  }

  /**
   * Predicts the downstream impact and blast radius if a node is intervened upon or reverted.
   */
  public predictInterventionImpact(
    graph: CausalGraph,
    targetNodeId: string
  ): CausalInterventionImpact {
    const targetNode = graph.nodes[targetNodeId];
    if (!targetNode) {
      throw new Error(`Target node "${targetNodeId}" not found in graph.`);
    }

    // Build forward adjacency: source -> targets
    const outgoing = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = outgoing.get(edge.source) || [];
      list.push(edge.target);
      outgoing.set(edge.source, list);
    }

    const invalidated = new Set<string>();
    const queue = [targetNodeId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const next of outgoing.get(curr) || []) {
        if (!invalidated.has(next)) {
          invalidated.add(next);
          queue.push(next);
        }
      }
    }

    // Identify affected artifacts
    const affectedArtifacts = new Set<string>();
    for (const id of invalidated) {
      const node = graph.nodes[id];
      if (node?.artifactPath) {
        affectedArtifacts.add(node.artifactPath);
      }
    }

    // Predict outcome change
    let predictedOutcome: InterventionOutcomePrediction = "unknown";
    let guidance = "";

    if (targetNode.status === "failure") {
      predictedOutcome = "rescued";
      guidance = `Intervening at ${targetNode.label} will invalidate ${invalidated.size} downstream nodes and likely rescue downstream execution.`;
    } else if (targetNode.type === "artifact_state") {
      predictedOutcome = "neutral";
      guidance = `Modifying artifact ${targetNode.artifactPath || targetNode.label} will trigger re-evaluation of ${invalidated.size} dependents.`;
    } else {
      predictedOutcome = "neutral";
      guidance = `Intervention at ${targetNode.label} affects ${invalidated.size} downstream dependencies.`;
    }

    return {
      targetNodeId,
      targetLabel: targetNode.label,
      invalidatedDownstreamNodeIds: Array.from(invalidated),
      affectedArtifactPaths: Array.from(affectedArtifacts),
      predictedOutcomeChange: predictedOutcome,
      guidance,
    };
  }
}

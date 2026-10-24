import { CausalGraph, CausalSlice, CausalNode } from "./types.js";

export class TrajectorySlicer {
  constructor() {}

  /**
   * Computes a backward dynamic slice from a target node in the causal graph.
   * Isolates all causal predecessors while identifying and pruning non-contributing noise.
   */
  public computeBackwardSlice(graph: CausalGraph, targetNodeId: string): CausalSlice {
    const targetNode = graph.nodes[targetNodeId];
    if (!targetNode) {
      throw new Error(`Target node "${targetNodeId}" not found in causal graph.`);
    }

    // Build reverse adjacency: target -> sources (incoming edges)
    const incomingEdges = new Map<string, string[]>();
    for (const edge of graph.edges) {
      const list = incomingEdges.get(edge.target) || [];
      list.push(edge.source);
      incomingEdges.set(edge.target, list);
    }

    // BFS / Queue to find all ancestors
    const visitedAncestors = new Set<string>();
    const queue: string[] = [targetNodeId];
    visitedAncestors.add(targetNodeId);

    const distances = new Map<string, number>();
    distances.set(targetNodeId, 0);

    const predecessors = new Map<string, string>(); // for critical path extraction

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDist = distances.get(current) || 0;
      const parents = incomingEdges.get(current) || [];

      for (const parent of parents) {
        if (!visitedAncestors.has(parent)) {
          visitedAncestors.add(parent);
          distances.set(parent, currentDist + 1);
          predecessors.set(parent, current);
          queue.push(parent);
        }
      }
    }

    const allNodeIds = Object.keys(graph.nodes);
    const ancestorNodeIds = Array.from(visitedAncestors);
    const prunedNodeIds = allNodeIds.filter((id) => !visitedAncestors.has(id));

    // Calculate maximum chain depth
    let maxDepth = 0;
    for (const dist of distances.values()) {
      if (dist > maxDepth) maxDepth = dist;
    }

    // Extract critical path (longest chain from earliest root to target)
    const criticalPathNodeIds = this.findLongestPathToTarget(graph, targetNodeId, visitedAncestors);

    const totalNodes = allNodeIds.length;
    const compressionRatio =
      totalNodes > 0 ? (totalNodes - ancestorNodeIds.length) / totalNodes : 0;

    return {
      targetNodeId,
      targetLabel: targetNode.label,
      ancestorNodeIds,
      prunedNodeIds,
      criticalPathNodeIds,
      causalChainDepth: maxDepth,
      sliceCompressionRatio: Math.max(0, Math.min(1, Number(compressionRatio.toFixed(3)))),
    };
  }

  /**
   * Finds the longest causal path from any root in the ancestor set to the target node.
   */
  private findLongestPathToTarget(
    graph: CausalGraph,
    targetNodeId: string,
    ancestors: Set<string>
  ): string[] {
    // Topologically sort the subgraph of ancestors
    const inDegree = new Map<string, number>();
    const outgoing = new Map<string, string[]>();

    for (const id of ancestors) {
      inDegree.set(id, 0);
      outgoing.set(id, []);
    }

    for (const edge of graph.edges) {
      if (ancestors.has(edge.source) && ancestors.has(edge.target)) {
        outgoing.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    }

    const zeroInDegree = Array.from(ancestors).filter((id) => inDegree.get(id) === 0);
    const topoOrder: string[] = [];
    const q = [...zeroInDegree];

    while (q.length > 0) {
      const u = q.shift()!;
      topoOrder.push(u);
      for (const v of outgoing.get(u) || []) {
        const d = (inDegree.get(v) || 1) - 1;
        inDegree.set(v, d);
        if (d === 0) {
          q.push(v);
        }
      }
    }

    // Longest path in DAG
    const dist = new Map<string, number>();
    const parent = new Map<string, string>();
    for (const id of ancestors) {
      dist.set(id, -Infinity);
    }

    for (const root of zeroInDegree) {
      dist.set(root, 0);
    }

    for (const u of topoOrder) {
      const uDist = dist.get(u);
      if (uDist === undefined || uDist === -Infinity) continue;

      for (const v of outgoing.get(u) || []) {
        if (uDist + 1 > (dist.get(v) || -Infinity)) {
          dist.set(v, uDist + 1);
          parent.set(v, u);
        }
      }
    }

    // Reconstruct path to targetNodeId
    const path: string[] = [];
    let curr: string | undefined = targetNodeId;
    while (curr) {
      path.unshift(curr);
      curr = parent.get(curr);
    }

    return path;
  }
}

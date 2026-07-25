/**
 * Pure, DB-free workflow-LEVEL cycle detection — the SubWorkflow analogue of
 * detectCircularReferences in engine.ts (same DFS/onStack/stack shape),
 * applied to Workflow nodes instead of step nodes. Takes the existing
 * dependency edge list (src/server/services/workflow-lifecycle.ts fetches it
 * from the WorkflowDependency table) plus the set of NEW child workflow ids
 * a draft about to be published would add, and reports whether publishing
 * would create a cycle — direct (A→A) or indirect (A→B→C→A), in any
 * pattern. Called at publish time (blocking) and, as a defense-in-depth
 * belt-and-suspenders check, walked again at real child-run-creation time
 * (src/server/actions/workflow-execution.ts) against the actual ancestor
 * chain of the run in progress — two independent layers, neither trusting
 * the other alone.
 */

export interface WorkflowDependencyEdge {
  workflowId: string;
  childWorkflowId: string;
}

export interface WorkflowCycleResult {
  hasCycle: boolean;
  /** The full cycle, e.g. ["A", "B", "C", "A"] — null when hasCycle is false. */
  path: string[] | null;
}

/**
 * Would adding edges workflowId → each of newChildIds (on top of
 * existingEdges, which never already contain an outgoing edge FROM
 * workflowId — the caller always passes the graph with workflowId's own
 * prior edges excluded, since publishing wholesale-replaces them) create a
 * cycle that loops back to workflowId? A self-reference (workflowId itself
 * appearing in newChildIds) is always reported as the trivial 1-node cycle.
 */
export function detectWorkflowCycle(
  existingEdges: WorkflowDependencyEdge[],
  workflowId: string,
  newChildIds: string[]
): WorkflowCycleResult {
  const adjacency = new Map<string, string[]>();
  for (const edge of existingEdges) {
    const list = adjacency.get(edge.workflowId) ?? [];
    list.push(edge.childWorkflowId);
    adjacency.set(edge.workflowId, list);
  }
  const uniqueNewChildren = [...new Set(newChildIds)];
  adjacency.set(workflowId, [...(adjacency.get(workflowId) ?? []), ...uniqueNewChildren]);

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let cyclePath: string[] | null = null;

  function visit(nodeId: string): void {
    if (cyclePath) return;
    visited.add(nodeId);
    onStack.add(nodeId);
    stack.push(nodeId);

    for (const next of adjacency.get(nodeId) ?? []) {
      if (cyclePath) break;
      if (next === workflowId) {
        cyclePath = [...stack, next];
        break;
      }
      if (!visited.has(next)) {
        visit(next);
      } else if (onStack.has(next)) {
        const cycleStart = stack.indexOf(next);
        if (cycleStart !== -1) cyclePath = [...stack.slice(cycleStart), next];
      }
    }

    stack.pop();
    onStack.delete(nodeId);
  }

  visit(workflowId);

  return { hasCycle: cyclePath !== null, path: cyclePath };
}

/**
 * All workflow ids transitively reachable FROM startId following the given
 * edges — used to answer "who do I (transitively) depend on" for UI display
 * (the direct WorkflowDependency rows already answer the one-hop version).
 * Cycle-safe (visited-guarded) even though a well-formed graph should never
 * contain one by the time this is called.
 */
export function reachableFrom(edges: WorkflowDependencyEdge[], startId: string): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.workflowId) ?? [];
    list.push(edge.childWorkflowId);
    adjacency.set(edge.workflowId, list);
  }
  const visited = new Set<string>();
  const queue = [...(adjacency.get(startId) ?? [])];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...(adjacency.get(id) ?? []));
  }
  return visited;
}

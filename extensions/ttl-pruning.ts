// TTL pruning module for the ADHD Context Engine
// Automatically marks sleeping nodes as Dead based on session TTL.
// No human-in-loop. No explicit kill tool needed. No sweep for pruning purposes.
// TTL resets on wake and on fresh sleep. Dead nodes stay in the graph (archived, not deleted).

import type { NodeGraph, GraphNode } from "./node-graph";
import { killNode, getSleepingNodes } from "./node-graph";

export class TTLManager {
  private defaultTTL: number;

  constructor(defaultTTL = 3) {
    this.defaultTTL = defaultTTL;
  }

  /**
   * Called at the start of each session.
   * Decrements TTL for all sleeping nodes and kills those with TTL <= 0.
   * Returns an array of pruned node IDs for logging.
   */
  onSessionStart(graph: NodeGraph): string[] {
    const pruned: string[] = [];

    for (const node of getSleepingNodes(graph)) {
      node.ttl -= 1;
      if (node.ttl <= 0) {
        killNode(graph, node.id);
        pruned.push(node.id);
      }
    }

    return pruned;
  }

  /**
   * Resets a node's TTL when it is woken.
   * Waking a node resets its TTL counter to the default.
   */
  onNodeWake(node: GraphNode): void {
    node.ttl = this.defaultTTL;
  }

  /**
   * Resets a node's TTL when it is put to sleep.
   * Fresh sleep resets TTL to default, giving it a full lease.
   */
  onNodeSleep(node: GraphNode): void {
    node.ttl = this.defaultTTL;
  }

  /**
   * Returns sleeping nodes that will be pruned on the next session start.
   * Useful for pre-session reporting or dashboard views.
   */
  getPrunableNodes(graph: NodeGraph): { id: string; label: string; ttl: number }[] {
    return getSleepingNodes(graph)
      .filter((node) => node.ttl <= 1)
      .map((node) => ({
        id: node.id,
        label: node.label,
        ttl: node.ttl,
      }));
  }

  /**
   * Manually override the TTL for a specific node.
   * Use to exempt a node from pruning or to accelerate it.
   */
  setNodeTTL(node: GraphNode, ttl: number): void {
    node.ttl = ttl;
  }
}

// Shelf storage: 3-layer search for sleeping nodes
// Layer 1: Always-visible index in system prompt
// Layer 2: Periodic sweep every 5 turns
// Layer 3: Keyword auto-wake

import { NodeGraph, GraphNode, getSleepingNodes } from "./node-graph";

export interface ShelfSearchResult {
  nodeId: string;
  label: string;
  relevance: number; // 0-1
  matchType: "keyword" | "semantic" | "exact";
}

export class ShelfStorage {
  private graph: NodeGraph;
  private turnCounter: number = 0;
  private sweepInterval: number = 5; // sweep every N turns
  private keywordIndex: Map<string, Set<string>> = new Map(); // keyword -> nodeIds

  constructor(graph: NodeGraph) {
    this.graph = graph;
  }

  // Layer 1: Always-visible index (call on every system prompt build)
  getShelfIndex(): string {
    return getShelfIndex(this.graph);
  }

  // Layer 2: Periodic sweep (call after every turn)
  shouldSweep(): boolean {
    this.turnCounter += 1;
    return this.turnCounter % this.sweepInterval === 0;
  }

  // Layer 2: Run sweep - returns nodes that match current context
  sweep(currentContext: string): ShelfSearchResult[] {
    const sleeping = getSleepingNodes(this.graph);
    const results: ShelfSearchResult[] = [];

    for (const node of sleeping) {
      const relevance = this.calculateRelevance(node, currentContext);
      if (relevance > 0.3) {
        results.push({
          nodeId: node.id,
          label: node.label,
          relevance,
          matchType: relevance > 0.8 ? "exact" : "keyword",
        });
      }
    }

    return results.sort((a, b) => b.relevance - a.relevance);
  }

  // Layer 3: Keyword auto-wake (call on reasoning/text generation)
  checkKeywordAutoWake(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const wakeNodeIds: Set<string> = new Set();

    for (const word of words) {
      const nodeIds = this.keywordIndex.get(word);
      if (nodeIds) {
        for (const id of nodeIds) {
          wakeNodeIds.add(id);
        }
      }
    }

    return Array.from(wakeNodeIds);
  }

  // Update keyword index when a node is created or updated
  updateKeywordIndex(node: GraphNode): void {
    const keywords = [
      ...node.tags,
      ...node.label.toLowerCase().split(/\s+/),
      ...node.summary.goal.toLowerCase().split(/\s+/),
    ];

    for (const keyword of keywords) {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword)!.add(node.id);
    }
  }

  // Remove node from keyword index
  removeFromKeywordIndex(nodeId: string): void {
    for (const [keyword, nodeIds] of this.keywordIndex.entries()) {
      nodeIds.delete(nodeId);
      if (nodeIds.size === 0) {
        this.keywordIndex.delete(keyword);
      }
    }
  }

  // Rebuild keyword index from graph
  rebuildIndex(): void {
    this.keywordIndex.clear();
    for (const node of this.graph.nodes.values()) {
      if (node.state === "sleeping") {
        this.updateKeywordIndex(node);
      }
    }
  }

  // Calculate relevance of a node to current context
  private calculateRelevance(node: GraphNode, context: string): number {
    const contextLower = context.toLowerCase();
    let score = 0;

    // Check label match
    if (contextLower.includes(node.label.toLowerCase())) {
      score += 0.5;
    }

    // Check goal match
    if (contextLower.includes(node.summary.goal.toLowerCase())) {
      score += 0.3;
    }

    // Check tag matches
    for (const tag of node.tags) {
      if (contextLower.includes(tag.toLowerCase())) {
        score += 0.2;
      }
    }

    // Check key file matches
    for (const file of node.summary.keyFiles) {
      if (contextLower.includes(file.toLowerCase())) {
        score += 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  // Serialize for persistence
  serialize(): object {
    return {
      turnCounter: this.turnCounter,
      keywordIndex: Array.from(this.keywordIndex.entries()).map(([k, v]) => [
        k,
        Array.from(v),
      ]),
    };
  }

  // Deserialize from persistence
  static deserialize(graph: NodeGraph, data: any): ShelfStorage {
    const shelf = new ShelfStorage(graph);
    shelf.turnCounter = data.turnCounter || 0;
    shelf.keywordIndex = new Map(
      (data.keywordIndex || []).map(([k, v]: [string, string[]]) => [
        k,
        new Set(v),
      ])
    );
    return shelf;
  }
}

function getShelfIndex(graph: NodeGraph): string {
  const sleeping = getSleepingNodes(graph);
  if (sleeping.length === 0) return "Shelf: empty";
  const names = sleeping.map((n) => `${n.id}(${n.label})`).join(", ");
  return `Shelf: [${names}]`;
}

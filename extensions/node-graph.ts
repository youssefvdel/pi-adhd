// Node graph: Active/Sleeping/Dead state machine
// Two-level loading: summary (~50t) on wake, full (~500-2000t) on expand

export type NodeState = "active" | "sleeping" | "dead";

export interface TrackedFile {
  path: string;
  modTime: number; // filesystem mtime in ms
  lastChecked: number;
}

export interface NodeSummary {
  goal: string;
  status: string;
  keyFiles: string[];
  lastAction: string;
}

export interface NodeFullContent {
  implementationNotes: string;
  codeContext: string;
  changeHistory: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  state: NodeState;
  summary: NodeSummary;
  fullContent: NodeFullContent | null; // null when sleeping/dead
  trackedFiles: Map<string, TrackedFile>;
  createdAt: number;
  lastActive: number;
  ttl: number; // sessions until auto-prune
  tags: string[]; // for keyword auto-wake
}

export interface NodeGraph {
  nodes: Map<string, GraphNode>;
  activeNodeIds: string[]; // ordered by last active
  sleepingNodeIds: string[];
  deadNodeIds: string[];
}

export function createNodeGraph(): NodeGraph {
  return {
    nodes: new Map(),
    activeNodeIds: [],
    sleepingNodeIds: [],
    deadNodeIds: [],
  };
}

export function createNode(
  graph: NodeGraph,
  id: string,
  label: string,
  summary: NodeSummary,
  tags: string[] = []
): GraphNode {
  const node: GraphNode = {
    id,
    label,
    state: "active",
    summary,
    fullContent: null,
    trackedFiles: new Map(),
    createdAt: Date.now(),
    lastActive: Date.now(),
    ttl: 3, // default: 3 sessions
    tags,
  };
  graph.nodes.set(id, node);
  graph.activeNodeIds.push(id);
  return node;
}

export function wakeNode(graph: NodeGraph, id: string): GraphNode | null {
  const node = graph.nodes.get(id);
  if (!node || node.state === "dead") return null;

  if (node.state === "sleeping") {
    graph.sleepingNodeIds = graph.sleepingNodeIds.filter((n) => n !== id);
    node.state = "active";
    node.lastActive = Date.now();
    node.ttl = 3; // reset TTL on wake
    graph.activeNodeIds.push(id);
  }
  return node;
}

export function expandNode(graph: NodeGraph, id: string): GraphNode | null {
  const node = graph.nodes.get(id);
  if (!node || node.state !== "active") return null;
  // Full content loaded on demand by extension
  return node;
}

export function collapseNode(graph: NodeGraph, id: string): GraphNode | null {
  const node = graph.nodes.get(id);
  if (!node || node.state !== "active") return null;
  node.fullContent = null; // evict full content, keep summary
  return node;
}

export function hibernateNode(graph: NodeGraph, id: string): GraphNode | null {
  const node = graph.nodes.get(id);
  if (!node || node.state !== "active") return null;

  graph.activeNodeIds = graph.activeNodeIds.filter((n) => n !== id);
  node.state = "sleeping";
  node.fullContent = null; // evict full content
  graph.sleepingNodeIds.push(id);
  return node;
}

export function killNode(graph: NodeGraph, id: string): GraphNode | null {
  const node = graph.nodes.get(id);
  if (!node) return null;

  if (node.state === "active") {
    graph.activeNodeIds = graph.activeNodeIds.filter((n) => n !== id);
  } else if (node.state === "sleeping") {
    graph.sleepingNodeIds = graph.sleepingNodeIds.filter((n) => n !== id);
  }
  node.state = "dead";
  node.fullContent = null;
  graph.deadNodeIds.push(id);
  return node;
}

export function getActiveNodes(graph: NodeGraph): GraphNode[] {
  return graph.activeNodeIds
    .map((id) => graph.nodes.get(id))
    .filter((n): n is GraphNode => n !== undefined);
}

export function getSleepingNodes(graph: NodeGraph): GraphNode[] {
  return graph.sleepingNodeIds
    .map((id) => graph.nodes.get(id))
    .filter((n): n is GraphNode => n !== undefined);
}

export function getShelfIndex(graph: NodeGraph): string {
  const sleeping = getSleepingNodes(graph);
  if (sleeping.length === 0) return "Shelf: empty";
  const names = sleeping.map((n) => `${n.id}(${n.label})`).join(", ");
  return `Shelf: [${names}]`;
}

export function pruneDeadNodes(graph: NodeGraph, sessionsSinceLastUse: number): string[] {
  const pruned: string[] = [];
  for (const id of graph.sleepingNodeIds) {
    const node = graph.nodes.get(id);
    if (node && node.ttl <= 0) {
      killNode(graph, id);
      pruned.push(id);
    }
  }
  return pruned;
}

export function decrementTTL(graph: NodeGraph): void {
  for (const id of graph.sleepingNodeIds) {
    const node = graph.nodes.get(id);
    if (node) {
      node.ttl -= 1;
    }
  }
}

export function serialize(graph: NodeGraph): object {
  return {
    nodes: Array.from(graph.nodes.entries()).map(([id, node]) => ({
      ...node,
      trackedFiles: Array.from(node.trackedFiles.entries()),
    })),
    activeNodeIds: graph.activeNodeIds,
    sleepingNodeIds: graph.sleepingNodeIds,
    deadNodeIds: graph.deadNodeIds,
  };
}

export function deserialize(data: any): NodeGraph {
  const graph = createNodeGraph();
  for (const nodeData of data.nodes) {
    const node: GraphNode = {
      ...nodeData,
      trackedFiles: new Map(nodeData.trackedFiles),
    };
    graph.nodes.set(node.id, node);
  }
  graph.activeNodeIds = data.activeNodeIds;
  graph.sleepingNodeIds = data.sleepingNodeIds;
  graph.deadNodeIds = data.deadNodeIds;
  return graph;
}

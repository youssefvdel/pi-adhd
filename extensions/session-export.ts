// Session export/import: cross-session node persistence
// Decision 6: Never auto-merge. Human decides what crosses the boundary.

import fs from "fs/promises";
import path from "path";
import type { NodeGraph, GraphNode } from "./node-graph";
import {
  serialize,
  deserialize,
  createNodeGraph,
  getSleepingNodes,
  getActiveNodes,
} from "./node-graph";

export interface SessionExportMeta {
  session_id: string;
  project: string;
  topic: string;
  node_count: number;
  active_count: number;
  sleeping_count: number;
  created_at: string;
}

interface SessionExportFile extends SessionExportMeta {
  nodes: any[];
}

export class SessionExporter {
  private sessionsDir: string;

  constructor(sessionsDir?: string) {
    this.sessionsDir = sessionsDir ?? path.join(process.cwd(), "sessions");
  }

  // Serialize graph + metadata to JSON file
  async exportSession(
    graph: NodeGraph,
    sessionId: string,
    topic: string,
  ): Promise<string> {
    await fs.mkdir(this.sessionsDir, { recursive: true });

    const serialized = serialize(graph);
    const activeNodes = getActiveNodes(graph);
    const sleepingNodes = getSleepingNodes(graph);

    const exportData: SessionExportFile = {
      session_id: sessionId,
      project: "pi-adhd",
      topic,
      node_count: serialized.nodes.length,
      active_count: activeNodes.length,
      sleeping_count: sleepingNodes.length,
      created_at: new Date().toISOString(),
      nodes: serialized.nodes,
    };

    const filename = `${sessionId.replace(/[^a-zA-Z0-9_-]/g, "_")}.nodes.json`;
    const filePath = path.join(this.sessionsDir, filename);
    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
    return filePath;
  }

  // Scan sessions/ dir for available exports
  async listPastSessions(): Promise<SessionExportMeta[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const sessions: SessionExportMeta[] = [];

    for (const file of files) {
      if (!file.endsWith(".nodes.json")) continue;
      try {
        const meta = await this.getSessionMetadata(
          path.join(this.sessionsDir, file),
        );
        sessions.push(meta);
      } catch {
        // skip corrupt files
      }
    }

    // most recent first
    return sessions.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  // Read metadata without loading full graph
  async getSessionMetadata(sessionFile: string): Promise<SessionExportMeta> {
    const content = await fs.readFile(sessionFile, "utf-8");
    const data = JSON.parse(content);
    return {
      session_id: data.session_id,
      project: data.project,
      topic: data.topic,
      node_count: data.node_count,
      active_count: data.active_count ?? 0,
      sleeping_count: data.sleeping_count ?? 0,
      created_at: data.created_at,
    };
  }

  // Import selected nodes from a past session
  // Returns GraphNode[] for caller to add to graph + shelf keyword index
  async importNodes(
    graph: NodeGraph,
    sessionFile: string,
    nodeIds: string[],
  ): Promise<GraphNode[]> {
    const content = await fs.readFile(sessionFile, "utf-8");
    const data = JSON.parse(content);

    // reconstruct a temporary graph so we use the same deserialization logic
    const sessionGraph = deserialize({
      nodes: data.nodes,
      activeNodeIds: [],
      sleepingNodeIds: [],
      deadNodeIds: [],
    });

    const imported: GraphNode[] = [];

    for (const nodeId of nodeIds) {
      const sourceNode = sessionGraph.nodes.get(nodeId);
      if (!sourceNode) continue;

      // resolve ID conflicts — append _imported
      let newId = nodeId;
      if (graph.nodes.has(newId)) {
        let counter = 1;
        while (graph.nodes.has(`${newId}_${counter}`)) {
          counter++;
        }
        newId = `${newId}_${counter}`;
      }

      // fresh node: sleeping, TTL=3, no full content
      const node: GraphNode = {
        id: newId,
        label: sourceNode.label,
        state: "sleeping",
        summary: { ...sourceNode.summary },
        fullContent: null,
        trackedFiles: new Map(sourceNode.trackedFiles),
        createdAt: Date.now(),
        lastActive: Date.now(),
        ttl: 3,
        tags: [...sourceNode.tags],
      };

      imported.push(node);
    }

    return imported;
  }
}

// TUI node display components
// Shows active/sleeping nodes in status bar and color-codes them in chat

import type { NodeGraph, GraphNode } from "./node-graph";
import { getActiveNodes, getSleepingNodes } from "./node-graph";

// Color palette for nodes (16 distinct colors)
const NODE_COLORS = [
  "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightRed", "brightGreen", "brightYellow", "brightBlue",
  "brightMagenta", "brightCyan", "brightWhite",
  "orange", "purple",
];

// Get color for a node based on its index
export function getNodeColor(nodeId: string, graph: NodeGraph): string {
  const allNodes = Array.from(graph.nodes.keys());
  const index = allNodes.indexOf(nodeId);
  return NODE_COLORS[index % NODE_COLORS.length];
}

// Format node status for TUI status bar
export function formatNodeStatus(graph: NodeGraph): string {
  const active = getActiveNodes(graph);
  const sleeping = getSleepingNodes(graph);

  if (active.length === 0 && sleeping.length === 0) {
    return "No nodes";
  }

  const parts: string[] = [];

  if (active.length > 0) {
    const activeNames = active.map((n) => n.label).join(", ");
    parts.push(`Active: ${activeNames}`);
  }

  if (sleeping.length > 0) {
    parts.push(`Shelf: ${sleeping.length}`);
  }

  return parts.join(" | ");
}

// Format node for inline display with color
export function formatNodeInline(node: GraphNode, color: string): string {
  return `[${node.id}]`; // Will be colored by the caller
}

// Format detailed node list for widget
export function formatNodeList(graph: NodeGraph): string {
  const active = getActiveNodes(graph);
  const sleeping = getSleepingNodes(graph);

  let output = "";

  if (active.length > 0) {
    output += "=== Active Nodes ===\n";
    for (const node of active) {
      const color = getNodeColor(node.id, graph);
      output += `${color} ${node.id}: ${node.label}\n`;
      output += `  Goal: ${node.summary.goal}\n`;
      output += `  Files: ${node.summary.keyFiles.join(", ")}\n`;
    }
  }

  if (sleeping.length > 0) {
    output += "\n=== Sleeping Nodes ===\n";
    for (const node of sleeping) {
      output += `${node.id}: ${node.label} (TTL: ${node.ttl})\n`;
    }
  }

  if (active.length === 0 && sleeping.length === 0) {
    output = "No nodes in graph";
  }

  return output;
}

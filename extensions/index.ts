// Main ADHD Context Engine extension for PI
// Registers tools and hooks into the agent lifecycle

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { NodeGraph } from "./node-graph";
import {
  createNodeGraph,
  createNode,
  wakeNode,
  expandNode,
  collapseNode,
  hibernateNode,
  killNode,
  getActiveNodes,
  getSleepingNodes,
  getInactiveNodes,
  getActiveTokens,
  deleteDeadNodes,
  serialize,
  deserialize,
} from "./node-graph";
import { ShelfStorage } from "./shelf-storage";
import { StalenessTracker } from "./staleness";
import { SessionExporter } from "./session-export";
import { TTLManager } from "./ttl-pruning";
import { SubagentManager } from "./subagent-manager";
import { parseNodeTags, stripNodeTags, hasNodeTags } from "./node-tag-parser";

let graph: NodeGraph = createNodeGraph();
let shelf: ShelfStorage = new ShelfStorage(graph);
let staleness: StalenessTracker = new StalenessTracker();
let sessionExporter: SessionExporter = new SessionExporter();
let ttlManager: TTLManager = new TTLManager();
let subagentManager: SubagentManager = new SubagentManager();
let turnCount: number = 0;
let autoSleepTimeout: number = 10 * 60 * 1000; // 10 minutes
let maxContextTokens: number = 180000;

export default function adhdExtension(pi: ExtensionAPI) {
  // Reconstruct state from session (last match wins)
  function reconstructState(ctx: any) {
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role === "toolResult" && msg.toolName?.startsWith("adhd_")) {
        const details = msg.details;
        if (details?.nodeGraph) {
          graph = deserialize(details.nodeGraph);
          shelf = ShelfStorage.deserialize(graph, details.shelf || {});
          if (details?.subagentManager) {
            subagentManager = SubagentManager.deserialize(details.subagentManager);
          }
          // Don't break - iterate all, last match wins
        }
      }
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    reconstructState(ctx);
    // TTL pruning: decrement and kill expired nodes
    const pruned = ttlManager.onSessionStart(graph);
    if (pruned.length > 0) {
      pi.sendMessage({
        customType: "adhd-ttl",
        content: `TTL pruning: ${pruned.length} nodes expired: ${pruned.join(", ")}`,
        display: true,
      });
    }
  });
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  // Inject node graph state into system prompt
  pi.on("before_agent_start", async (event, ctx) => {
    turnCount += 1;

    // Check for keyword auto-wake
    const autoWakeIds = shelf.checkKeywordAutoWake(event.prompt);
    for (const id of autoWakeIds) {
      const node = wakeNode(graph, id);
      if (node) {
        staleness.checkStaleness(node);
      }
    }

    // Periodic sweep
    if (shelf.shouldSweep()) {
      shelf.sweep(event.prompt);
    }

    // Auto-sleep inactive nodes
    const inactiveNodes = getInactiveNodes(graph, autoSleepTimeout);
    for (const node of inactiveNodes) {
      hibernateNode(graph, node.id);
      shelf.updateKeywordIndex(node);
    }

    // Clean up dead nodes
    const deleted = deleteDeadNodes(graph);
    if (deleted > 0) {
      pi.sendMessage({
        customType: "adhd-cleanup",
        content: `Cleaned up ${deleted} dead nodes`,
        display: true,
      });
    }

    const activeNodes = getActiveNodes(graph);
    const sleepingNodes = getSleepingNodes(graph);

    let contextInjection = `\n\n[ADHD Context Engine]\n`;
    contextInjection += `Active nodes: ${activeNodes.length}\n`;
    contextInjection += `Shelf: ${shelf.getShelfIndex()}\n`;

    const activeTokens = getActiveTokens(graph);
    contextInjection += `Context usage: ~${activeTokens}/${maxContextTokens} tokens\n`;

    if (activeNodes.length > 0) {
      contextInjection += `\nActive node details:\n`;
      for (const node of activeNodes) {
        contextInjection += `- ${node.id}: ${node.label} (${node.summary.status})\n`;
        contextInjection += `  Goal: ${node.summary.goal}\n`;
        contextInjection += `  Key files: ${node.summary.keyFiles.join(", ")}\n`;
      }
    }

    return {
      systemPrompt: event.systemPrompt + contextInjection,
    };
  });

  // Track file operations for staleness
  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    const input = event.input;

    // Track writes
    if (toolName === "write" || toolName === "edit") {
      const path = input.path || input.filePath;
      if (path) {
        // Track for all active nodes
        for (const node of getActiveNodes(graph)) {
          staleness.trackFileWrite(node, path);
        }
      }
    }

    // Track reads for staleness check
    if (toolName === "read") {
      const path = input.path || input.filePath;
      if (path) {
        // Check if any active node has this file tracked
        for (const node of getActiveNodes(graph)) {
          if (node.trackedFiles.has(path)) {
            const result = staleness.checkStaleness(node);
            if (result.isStale) {
              pi.sendMessage({
                customType: "adhd-staleness",
                content: `Warning: Node ${node.id} has stale files: ${result.staleFiles.join(", ")}`,
                display: true,
              });
            }
          }
        }
      }
    }
  });

  // Process <node> tags in agent output
  pi.on("tool_result", async (event, ctx) => {
    // Only process assistant messages (not tool results)
    if (event.role !== "assistant") return;

    const content = typeof event.content === "string" ? event.content : "";
    if (!hasNodeTags(content)) return;

    const parsedNodes = parseNodeTags(content);

    for (const parsed of parsedNodes) {
      // Check if node already exists
      if (graph.nodes.has(parsed.id)) {
        // Node exists, just update lastActive
        const existing = graph.nodes.get(parsed.id)!;
        existing.lastActive = Date.now();
        continue;
      }

      // Create new node
      const node = createNode(graph, parsed.id, parsed.label, {
        goal: parsed.goal,
        status: "active",
        keyFiles: parsed.files,
        lastAction: "created via <node> tag",
      }, parsed.tags);

      shelf.updateKeywordIndex(node);

      // Track files
      for (const file of parsed.files) {
        staleness.trackFileWrite(node, file);
      }
    }

    // Strip tags from content before passing to LLM
    const cleanContent = stripNodeTags(content);

    return {
      content: cleanContent,
      details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
    };
  });

  // Register ADHD tools
  registerTools(pi);
}

function registerTools(pi: ExtensionAPI) {
  // Create a new node
  pi.registerTool({
    name: "adhd_create_node",
    label: "Create Node",
    description: "Create a new thought node in the ADHD context graph",
    promptSnippet: "Use when starting a new line of work or capturing a new idea",
    promptGuidelines: [
      "Create a node when you start working on something new",
      "Give it a clear, descriptive label",
      "Include the goal and key files in the summary",
    ],
    parameters: Type.Object({
      id: Type.String({ description: "Unique node ID (e.g., auth_jwt, rate_limiter)" }),
      label: Type.String({ description: "Short descriptive label" }),
      goal: Type.String({ description: "What this node is trying to accomplish" }),
      keyFiles: Type.Array(Type.String(), { description: "Files this node will touch" }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Keywords for auto-wake" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const node = createNode(graph, params.id, params.label, {
        goal: params.goal,
        status: "active",
        keyFiles: params.keyFiles,
        lastAction: "created",
      }, params.tags || []);

      shelf.updateKeywordIndex(node);

      return {
        content: [{ type: "text", text: `Created node: ${params.id} (${params.label})` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Wake a sleeping node
  pi.registerTool({
    name: "adhd_wake_node",
    label: "Wake Node",
    description: "Wake a sleeping node and restore its context",
    promptSnippet: "Use when the user references something that was previously hibernated",
    promptGuidelines: [
      "Wake a node when you need to work on it again",
      "The node will be checked for staleness on wake",
    ],
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node ID to wake" }),
      reason: Type.Optional(Type.String({ description: "Why this node is being woken" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const node = wakeNode(graph, params.nodeId);
      if (!node) {
        return {
          content: [{ type: "text", text: `Node ${params.nodeId} not found or is dead` }],
          details: { error: true },
        };
      }

      const stalenessResult = staleness.checkStaleness(node);
      let message = `Woke node: ${node.id} (${node.label})`;
      if (stalenessResult.isStale) {
        message += `\nWARNING: Stale files detected: ${stalenessResult.staleFiles.join(", ")}`;
        message += `\nThese files changed while the node was sleeping. Consider creating a fresh node.`;
      }

      return {
        content: [{ type: "text", text: message }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize(), staleness: stalenessResult },
      };
    },
  });

  // Expand a node (load full content)
  pi.registerTool({
    name: "adhd_expand_node",
    label: "Expand Node",
    description: "Expand a node to load its full content into context",
    promptSnippet: "Use when you need detailed implementation notes for a node",
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node ID to expand" }),
      content: Type.String({ description: "Full implementation notes, code context, change history" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const node = graph.nodes.get(params.nodeId);
      if (!node || node.state !== "active") {
        return {
          content: [{ type: "text", text: `Node ${params.nodeId} not found or not active` }],
          details: { error: true },
        };
      }

      node.fullContent = {
        implementationNotes: params.content,
        codeContext: "",
        changeHistory: [],
      };

      return {
        content: [{ type: "text", text: `Expanded node: ${node.id}` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Collapse a node (unload full content)
  pi.registerTool({
    name: "adhd_collapse_node",
    label: "Collapse Node",
    description: "Collapse a node back to summary only",
    promptSnippet: "Use when done working on a node and want to free context",
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node ID to collapse" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const node = collapseNode(graph, params.nodeId);
      if (!node) {
        return {
          content: [{ type: "text", text: `Node ${params.nodeId} not found or not active` }],
          details: { error: true },
        };
      }

      return {
        content: [{ type: "text", text: `Collapsed node: ${node.id}` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Hibernate a node (put on shelf)
  pi.registerTool({
    name: "adhd_hibernate_node",
    label: "Hibernate Node",
    description: "Hibernate a node and put it on the shelf",
    promptSnippet: "Use when switching away from a node but want to keep it for later",
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node ID to hibernate" }),
      summary: Type.Optional(Type.String({ description: "Updated summary before hibernating" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (params.summary) {
        const node = graph.nodes.get(params.nodeId);
        if (node) {
          node.summary.lastAction = params.summary;
        }
      }

      const node = hibernateNode(graph, params.nodeId);
      if (!node) {
        return {
          content: [{ type: "text", text: `Node ${params.nodeId} not found or not active` }],
          details: { error: true },
        };
      }

      return {
        content: [{ type: "text", text: `Hibernated node: ${node.id}. Now on shelf.` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Kill a node (mark dead)
  pi.registerTool({
    name: "adhd_kill_node",
    label: "Kill Node",
    description: "Kill a node (mark as dead, remove from graph)",
    promptSnippet: "Use when a node is no longer relevant or was replaced",
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node ID to kill" }),
      reason: Type.Optional(Type.String({ description: "Why this node is being killed" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const node = killNode(graph, params.nodeId);
      if (!node) {
        return {
          content: [{ type: "text", text: `Node ${params.nodeId} not found` }],
          details: { error: true },
        };
      }

      shelf.removeFromKeywordIndex(params.nodeId);

      return {
        content: [{ type: "text", text: `Killed node: ${params.nodeId}${params.reason ? ` (${params.reason})` : ""}` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Search the shelf
  pi.registerTool({
    name: "adhd_search_shelf",
    label: "Search Shelf",
    description: "Search sleeping nodes on the shelf",
    promptSnippet: "Use to find relevant sleeping nodes",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const results = shelf.sweep(params.query);
      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No matching nodes found on shelf" }],
          details: { results: [] },
        };
      }

      const message = results
        .map((r) => `- ${r.nodeId} (${r.label}): ${r.matchType} match, relevance ${r.relevance.toFixed(2)}`)
        .join("\n");

      return {
        content: [{ type: "text", text: `Found ${results.length} matching nodes:\n${message}` }],
        details: { results },
      };
    },
  });

  // List all nodes
  pi.registerTool({
    name: "adhd_list_nodes",
    label: "List Nodes",
    description: "List all nodes in the graph (active, sleeping, dead)",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const active = getActiveNodes(graph);
      const sleeping = getSleepingNodes(graph);

      let message = "=== Active Nodes ===\n";
      for (const node of active) {
        message += `- ${node.id}: ${node.label} (${node.summary.status})\n`;
        message += `  Goal: ${node.summary.goal}\n`;
      }

      message += "\n=== Sleeping Nodes (Shelf) ===\n";
      for (const node of sleeping) {
        message += `- ${node.id}: ${node.label} (TTL: ${node.ttl})\n`;
        message += `  Goal: ${node.summary.goal}\n`;
      }

      if (active.length === 0 && sleeping.length === 0) {
        message = "No nodes in graph. Use adhd_create_node to create one.";
      }

      return {
        content: [{ type: "text", text: message }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Export current session
  pi.registerTool({
    name: "adhd_export_session",
    label: "Export Session",
    description: "Export current node graph to a session file for later import",
    promptSnippet: "Use before closing a session to preserve nodes for future sessions",
    parameters: Type.Object({
      topic: Type.String({ description: "Topic/description of this session's work" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const sessionId = `session_${Date.now()}`;
      try {
        const filePath = await sessionExporter.exportSession(graph, sessionId, params.topic);
        return {
          content: [{ type: "text", text: `Session exported to: ${filePath}` }],
          details: { sessionId, filePath },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Export failed: ${error.message}` }],
          details: { error: true },
        };
      }
    },
  });

  // List past sessions for import
  pi.registerTool({
    name: "adhd_list_past_sessions",
    label: "List Past Sessions",
    description: "List available past sessions for import",
    promptSnippet: "Use to see what sessions are available to import nodes from",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const sessions = await sessionExporter.listPastSessions();
        if (sessions.length === 0) {
          return {
            content: [{ type: "text", text: "No past sessions found" }],
            details: { sessions: [] },
          };
        }

        const message = sessions
          .map((s) => `- ${s.session_id}: ${s.topic} (${s.node_count} nodes, ${s.created_at})`)
          .join("\n");

        return {
          content: [{ type: "text", text: `Past sessions:\n${message}` }],
          details: { sessions },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Failed to list sessions: ${error.message}` }],
          details: { error: true },
        };
      }
    },
  });

  // Import nodes from a past session
  pi.registerTool({
    name: "adhd_import_session",
    label: "Import Session",
    description: "Import selected nodes from a past session into current graph",
    promptSnippet: "Use to restore nodes from a previous session",
    parameters: Type.Object({
      sessionFile: Type.String({ description: "Path to the session file" }),
      nodeIds: Type.Array(Type.String(), { description: "Node IDs to import" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const imported = await sessionExporter.importNodes(graph, params.sessionFile, params.nodeIds);

        // Add imported nodes to graph and shelf
        for (const node of imported) {
          graph.nodes.set(node.id, node);
          graph.sleepingNodeIds.push(node.id);
          shelf.updateKeywordIndex(node);
        }

        return {
          content: [{ type: "text", text: `Imported ${imported.length} nodes: ${imported.map(n => n.id).join(", ")}` }],
          details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Import failed: ${error.message}` }],
          details: { error: true },
        };
      }
    },
  });

  // Delegate a node's task to a sub-agent with file conflict detection
  pi.registerTool({
    name: "adhd_delegate_task",
    label: "Delegate Task",
    description: "Delegate a node's task to a sub-agent with file conflict detection",
    promptSnippet: "Use to spawn a sub-agent for a node, with file overlap checking",
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node to delegate" }),
      task: Type.String({ description: "Task description for the sub-agent" }),
      files: Type.Array(Type.String(), { description: "Files the sub-agent will touch" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { locked, free } = subagentManager.checkFileOverlap(params.files);

      if (locked.length > 0) {
        return {
          content: [{ type: "text", text: `Cannot delegate: files locked by other nodes: ${locked.join(", ")}\nWait for those nodes to finish, or choose different files.` }],
          details: { conflict: true, lockedFiles: locked },
        };
      }

      // Lock files for this node
      subagentManager.lockFiles(params.nodeId, params.files);

      return {
        content: [{ type: "text", text: `Ready to delegate node ${params.nodeId}. Files locked: ${params.files.join(", ")}\n\nUse the \`subagent\` tool with:\n- agent: "worker"\n- task: "${params.task}"\n\nWhen done, call \`adhd_unlock_files\` to release the locks.` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize(), lockedFiles: params.files },
      };
    },
  });

  // Release file locks after sub-agent completes
  pi.registerTool({
    name: "adhd_unlock_files",
    label: "Unlock Files",
    description: "Release file locks after sub-agent completes",
    promptSnippet: "Use after a sub-agent finishes to release file locks",
    parameters: Type.Object({
      nodeId: Type.String({ description: "The node whose files to unlock" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      subagentManager.unlockFiles(params.nodeId);

      return {
        content: [{ type: "text", text: `Unlocked files for node ${params.nodeId}` }],
        details: { nodeGraph: serialize(graph), shelf: shelf.serialize(), subagentManager: subagentManager.serialize() },
      };
    },
  });

  // Set context limit at runtime
  pi.registerTool({
    name: "adhd_set_context_limit",
    label: "Set Context Limit",
    description: "Change the maximum context window token limit at runtime",
    parameters: Type.Object({
      limit: Type.Number({ description: "New maximum token limit (e.g. 180000)" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const old = maxContextTokens;
      maxContextTokens = params.limit;
      return {
        content: [{ type: "text", text: `Context limit changed from ${old} to ${maxContextTokens}` }],
        details: { oldLimit: old, newLimit: maxContextTokens },
      };
    },
  });

  // Show current file locks
  pi.registerTool({
    name: "adhd_check_locks",
    label: "Check Locks",
    description: "Show current file locks",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const locks = subagentManager.getLockState();

      if (locks.length === 0) {
        return {
          content: [{ type: "text", text: "No file locks active" }],
          details: { locks: [] },
        };
      }

      const message = locks
        .map((l) => `- ${l.path}: locked by ${l.lockedBy} (since ${new Date(l.lockedAt).toISOString()})`)
        .join("\n");

      return {
        content: [{ type: "text", text: `Active file locks:\n${message}` }],
        details: { locks },
      };
    },
  });
}

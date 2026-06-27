// Sub-agent manager: wraps pi-subagents with node graph integration
// Provides file overlap detection and depth cap enforcement

import type { NodeGraph, GraphNode } from "./node-graph";
import { getActiveNodes } from "./node-graph";

export interface SubagentTask {
  nodeId: string;
  task: string;
  files: string[];
}

export interface FileLock {
  path: string;
  lockedBy: string; // nodeId
  lockedAt: number;
}

export class SubagentManager {
  private fileLocks: Map<string, FileLock> = new Map();
  private maxDepth: number = 1; // Hard cap: juniors cannot spawn sub-agents

  // Check if files overlap with existing locks
  checkFileOverlap(files: string[]): { locked: string[]; free: string[] } {
    const locked: string[] = [];
    const free: string[] = [];

    for (const file of files) {
      if (this.fileLocks.has(file)) {
        locked.push(file);
      } else {
        free.push(file);
      }
    }

    return { locked, free };
  }

  // Lock files for a node
  lockFiles(nodeId: string, files: string[]): void {
    for (const file of files) {
      this.fileLocks.set(file, {
        path: file,
        lockedBy: nodeId,
        lockedAt: Date.now(),
      });
    }
  }

  // Unlock files for a node
  unlockFiles(nodeId: string): void {
    for (const [path, lock] of this.fileLocks.entries()) {
      if (lock.lockedBy === nodeId) {
        this.fileLocks.delete(path);
      }
    }
  }

  // Check if parallel spawning is safe (no file overlap)
  canSpawnParallel(tasks: SubagentTask[]): { safe: boolean; conflicts: string[] } {
    const allFiles = new Set<string>();
    const conflicts: string[] = [];

    for (const task of tasks) {
      for (const file of task.files) {
        if (allFiles.has(file)) {
          conflicts.push(file);
        }
        allFiles.add(file);
      }
    }

    // Also check against existing locks
    const { locked } = this.checkFileOverlap(Array.from(allFiles));
    conflicts.push(...locked);

    return {
      safe: conflicts.length === 0,
      conflicts: [...new Set(conflicts)], // dedupe
    };
  }

  // Get current lock state (for debugging/reporting)
  getLockState(): FileLock[] {
    return Array.from(this.fileLocks.values());
  }

  // Serialize for persistence
  serialize(): object {
    return {
      fileLocks: Array.from(this.fileLocks.entries()),
    };
  }

  // Deserialize from persistence
  static deserialize(data: any): SubagentManager {
    const manager = new SubagentManager();
    if (data.fileLocks) {
      manager.fileLocks = new Map(data.fileLocks);
    }
    return manager;
  }
}

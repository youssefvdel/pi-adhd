// File staleness tracking
// Track only written files. Compare filesystem mod time on wake. Check every wake.

import { GraphNode, TrackedFile } from "./node-graph";
import * as fs from "fs";

export class StalenessTracker {
  // Track file write for a node
  trackFileWrite(node: GraphNode, filePath: string): void {
    try {
      const stats = fs.statSync(filePath);
      node.trackedFiles.set(filePath, {
        path: filePath,
        modTime: stats.mtimeMs,
        lastChecked: Date.now(),
      });
    } catch {
      // File doesn't exist yet, track with current time
      node.trackedFiles.set(filePath, {
        path: filePath,
        modTime: Date.now(),
        lastChecked: Date.now(),
      });
    }
  }

  // Check if any tracked files are stale on wake
  checkStaleness(node: GraphNode): StalenessResult {
    const staleFiles: string[] = [];

    for (const [path, tracked] of node.trackedFiles.entries()) {
      try {
        const stats = fs.statSync(path);
        if (stats.mtimeMs !== tracked.modTime) {
          staleFiles.push(path);
        }
      } catch {
        // File deleted = stale
        staleFiles.push(path);
      }
    }

    return {
      isStale: staleFiles.length > 0,
      staleFiles,
      totalTracked: node.trackedFiles.size,
    };
  }

  // Update mod times after successful wake (no staleness)
  refreshTimestamps(node: GraphNode): void {
    for (const [path, tracked] of node.trackedFiles.entries()) {
      try {
        const stats = fs.statSync(path);
        tracked.modTime = stats.mtimeMs;
        tracked.lastChecked = Date.now();
      } catch {
        // File gone, remove tracking
        node.trackedFiles.delete(path);
      }
    }
  }

  // Get files that need re-reading for a junior
  getFilesToReRead(node: GraphNode): string[] {
    const filesToReRead: string[] = [];

    for (const [path, tracked] of node.trackedFiles.entries()) {
      try {
        const stats = fs.statSync(path);
        if (stats.mtimeMs !== tracked.modTime) {
          filesToReRead.push(path);
        }
      } catch {
        filesToReRead.push(path);
      }
    }

    return filesToReRead;
  }
}

export interface StalenessResult {
  isStale: boolean;
  staleFiles: string[];
  totalTracked: number;
}

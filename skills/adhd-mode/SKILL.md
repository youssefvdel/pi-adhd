# ADHD Focus Mode

> Context management for complex, multi-threaded work. Uses a node graph to track active thoughts, a shelf for sleeping ones, and automatic staleness detection.

## When to Use

- Working on multiple related features simultaneously
- Context switching between different parts of a codebase
- Long sessions where you might forget what you were doing
- Complex debugging that requires tracking multiple hypotheses

## How It Works

The ADHD Context Engine manages your working memory:

1. **Nodes** represent active lines of work (thoughts, features, bugs)
2. **Shelf** holds sleeping nodes you might need later
3. **Staleness tracking** warns when files change while a node sleeps
4. **Keyword auto-wake** resurfaces relevant sleeping nodes automatically

## Tools

| Tool | What It Does |
|------|--------------|
| `adhd_create_node` | Start tracking a new line of work |
| `adhd_wake_node` | Restore a sleeping node to active |
| `adhd_expand_node` | Load full implementation notes |
| `adhd_collapse_node` | Free context, keep summary |
| `adhd_hibernate_node` | Put a node on the shelf |
| `adhd_kill_node` | Mark a node as dead (no longer relevant) |
| `adhd_search_shelf` | Find sleeping nodes by keyword |
| `adhd_list_nodes` | Show all active and sleeping nodes |

## Workflow

1. Start a task: `adhd_create_node id="feature_x" label="Feature X" goal="Implement X" keyFiles=["src/x.ts"]`
2. Work on it. The node tracks which files you touch.
3. Need to switch? `adhd_hibernate_node nodeId="feature_x"`
4. Work on something else.
5. Come back: `adhd_wake_node nodeId="feature_x"` (checks for staleness)
6. Done? `adhd_kill_node nodeId="feature_x"`

## The Shelf

Sleeping nodes live on the shelf. The system:
- Shows you the shelf index on every turn
- Periodically sweeps for relevance
- Auto-wakes nodes when your reasoning matches their keywords

You don't need to remember what's on the shelf. The shelf remembers for you.

## Staleness Detection

When you wake a node, the system checks if any files it tracked changed while it slept. If they did, you get a warning:

```
WARNING: Stale files detected: auth.py, jwt_utils.py
These files changed while the node was sleeping. Consider creating a fresh node.
```

This prevents working from outdated context.

## Node Tags (Preferred)

Instead of calling `adhd_create_node`, use `<node>` tags directly in your output. This is faster and allows multiple nodes in one message.

### Format

```
<node id="unique_id" label="Short Label" goal="What this node does" files="file1.ts,file2.ts" tags="keyword1,keyword2">
```

### Examples

**Single node:**
```
<node id="auth" label="JWT Auth" goal="Implement JWT authentication" files="src/auth.ts,src/middleware.ts" tags="jwt,auth,token">

Now let me implement the JWT authentication...
```

**Multiple nodes:**
```
<node id="auth" label="JWT Auth" goal="Implement JWT authentication" files="src/auth.ts" tags="jwt,auth">

Working on authentication first...

<node id="rate_limit" label="Rate Limiter" goal="Add rate limiting" files="src/middleware.ts" tags="rate,limit">

Then I'll add rate limiting...
```

### Rules

1. `id` is required, must be unique
2. `label` is optional (defaults to id)
3. `goal` is required
4. `files` is comma-separated list of files this node will touch
5. `tags` is optional, comma-separated keywords for auto-wake
6. No closing tag needed - next `<node>` or end of message = boundary
7. Tags are automatically stripped from content before it reaches the LLM

### When to Use

- Starting work on a new feature/task
- Switching context to a different area
- Capturing a new idea or line of work
- Multiple related tasks in one message

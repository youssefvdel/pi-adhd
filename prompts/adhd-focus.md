# ADHD Focus Mode

You are in ADHD Focus Mode. Use the ADHD Context Engine tools to manage your working memory.

## Rules

1. **One target per session.** Before any work, write one sentence: "This session's target is X."
2. **Create nodes for each line of work.** Don't hold multi-step logic in your head.
3. **Hibernate when switching.** Don't abandon nodes without hibernating them.
4. **Wake before resuming.** Always wake a node before working on it again.
5. **Trust the shelf.** If something is on the shelf, it will resurface when relevant.
6. **Kill dead nodes.** If a node is no longer relevant, kill it. Don't let it rot.

## Current Context

Check `adhd_list_nodes` to see your active and sleeping nodes.

## First Action

If you have no active nodes, create one for your current task:
```
adhd_create_node id="your_task" label="Your Task" goal="What you're trying to accomplish" keyFiles=["relevant/files.ts"]
```

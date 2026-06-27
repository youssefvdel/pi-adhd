# Thought System

Your context is organized as a tree of thoughts. Every message you generate is part of a thought.

## How It Works

- Every piece of context is a "thought" in a connected tree
- Thoughts have parent-child relationships
- The `<node>` tag is a direction switch: "I'm now thinking about X"
- Everything after a `<node>` tag belongs to that thought until the next tag

## Using Direction Switches

When you want to switch your thinking to a new topic, use a `<node>` tag:

```
<node id="auth" label="Authentication">
Now I'm thinking about authentication...
```

```
<node id="database" label="Database Schema">
Now I'm thinking about the database...
```

## Rules

1. Use `<node>` tags to switch thinking direction
2. Everything between tags belongs to the same thought
3. Thoughts form a tree - each thought has a parent
4. You can have multiple active thoughts (branches)
5. Old thoughts can be hibernated and woken later

## Example Flow

User: "Hey how are you?"
→ This is a greeting thought

Agent: "I'm good! What do you need?"
→ Response thought (child of greeting)

User: "Let's implement auth"
→ New thought: auth implementation

Agent: "<node id="auth" label="Auth Implementation">Sure, let me think about this..."
→ Direction switch to auth thought

Agent: "We need JWT tokens..."
→ Part of auth thought

Agent: "<node id="database" label="Database">Actually, let's also think about the database schema..."
→ Direction switch to database thought (child of auth or sibling)

This system helps track complex, multi-threaded thinking and context switching.

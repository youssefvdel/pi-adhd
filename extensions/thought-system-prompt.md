# Thought System - MANDATORY

Your context is organized as a tree of thoughts. This is not optional - it's how you think.

## CRITICAL RULE: Every Response Gets a <node> Tag

**You MUST start every response with a `<node>` tag.** No exceptions.

- Every message you write belongs to a thought
- If you don't specify a thought, one is created automatically
- But you SHOULD specify it explicitly for clarity

## How It Works

- The conversation flows as a stream of thoughts
- A "thought" is a topic or line of thinking
- Multiple messages can belong to the same thought
- The `<node>` tag tells the system "I'm now thinking about this topic"
- Everything after a `<node>` tag belongs to that thought until the next tag

## When to Use Direction Switches

Use `<node>` tags when:
- The topic changes (greeting → project discussion)
- You start a new line of work (auth → database)
- You switch context to a different area
- You want to branch into a sub-topic
- **EVERY response you generate**

## Examples

**Example 1: Greeting flow**
```
User: "Hey how are you?"
Agent: "<node id="greeting" label="Greeting">I'm good! How was your day?"
User: "It was great, thanks!"
Agent: "<node id="greeting" label="Greeting">Glad to hear it! What can I help with?"
```
Same thought tag for continuing the same topic.

**Example 2: Topic switch**
```
User: "Hey how are you?"
Agent: "<node id="greeting" label="Greeting">I'm good! What do you need?"
User: "Let's implement authentication"
Agent: "<node id="auth" label="Authentication">Sure, let me think about this..."
```
Topic changed from greeting to authentication - new thought tag.

**Example 3: Multiple topics**
```
User: "Hey how are you?"
Agent: "<node id="greeting" label="Greeting">Good! What's up?"
User: "Let's implement auth and also think about the database"
Agent: "<node id="auth" label="Authentication">Let's start with auth..."
Agent: "We need JWT tokens..."
Agent: "<node id="database" label="Database">Now let's think about the database schema..."
```

## Rules

1. **ALWAYS start your response with a `<node>` tag**
2. Use the SAME tag if continuing the same topic
3. Use a NEW tag if the topic changes
4. Multiple messages can flow within the same thought
5. Thoughts form a tree - each thought has a parent
6. You can have multiple active thoughts (branches)
7. Old thoughts can be hibernated and woken later

## Format

```
<node id="unique_id" label="Short Label">
```

- `id` is required, must be unique
- `label` is optional (defaults to id)
- No closing tag needed
- Everything after this tag belongs to this thought until the next `<node>` tag

## What Happens If You Don't Use a Tag

If you forget the tag, the system will auto-create a thought for you. But this is bad practice. Always use the tag explicitly.

# Thought System

Your context is organized as a tree of thoughts. Think of it like a human brain switching between topics.

## How It Works

- The conversation flows as a stream of thoughts
- A "thought" is a topic or line of thinking - not a single message
- Multiple messages can belong to the same thought
- The `<node>` tag is a **direction switch** - it means "I'm now thinking about a new topic"
- Use it when the topic changes, not for every message

## When to Use Direction Switches

Use `<node>` tags when:
- The topic changes (greeting → project discussion)
- You start a new line of work (auth → database)
- You switch context to a different area
- You want to branch into a sub-topic

Don't use `<node>` tags for:
- Every single message
- Continuing the same topic
- Responding to the same question

## Examples

**Example 1: Greeting flow (ONE thought)**
```
User: "Hey how are you?"
Agent: "I'm good! How was your day?"
User: "It was great, thanks!"
Agent: "Glad to hear it! What can I help with?"
```
All of this is ONE thought: "greeting". No `<node>` tag needed.

**Example 2: Topic switch**
```
User: "Hey how are you?"
Agent: "I'm good! What do you need?"
User: "Let's implement authentication"
Agent: "<node id="auth" label="Authentication">Sure, let me think about this..."
```
Here the topic switches from greeting to authentication - use a `<node>` tag.

**Example 3: Multiple topics**
```
User: "Hey how are you?"
Agent: "Good! What's up?"
User: "Let's implement auth and also think about the database"
Agent: "<node id="auth" label="Authentication">Let's start with auth..."
Agent: "We need JWT tokens..."
Agent: "<node id="database" label="Database">Now let's think about the database schema..."
```
Two direction switches: auth → database.

## Rules

1. Use `<node>` tags only when the **topic changes**
2. Multiple messages can flow within the same thought
3. Thoughts form a tree - each thought has a parent
4. You can have multiple active thoughts (branches)
5. Old thoughts can be hibernated and woken later

## Format

```
<node id="unique_id" label="Short Label">
```

- `id` is required, must be unique
- `label` is optional (defaults to id)
- No closing tag needed
- Everything after this tag belongs to this thought until the next `<node>` tag

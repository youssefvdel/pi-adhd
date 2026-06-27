// Node tag parser: extracts <node> direction switches from agent output
// Open-only tags, no closing tag needed
// Format: <node id="..." label="..." goal="..." files="..." tags="...">

export interface ParsedNodeTag {
  id: string;
  label: string;
  goal: string;
  files: string[];
  tags: string[];
  startIndex: number; // position in content where tag starts
  endIndex: number;   // position in content where tag ends
}

// Parse all <node> tags from content
export function parseNodeTags(content: string): ParsedNodeTag[] {
  const nodes: ParsedNodeTag[] = [];

  // Match <node ...> with any attributes
  // Uses non-greedy match for attributes, stops at >
  const regex = /<node\s+([^>]*?)(?:\s*\/?)>/gi;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const attrString = match[1];
    const startIndex = match.index;
    const endIndex = match.index + match[0].length;

    const attrs = parseAttributes(attrString);

    // Required attributes
    const id = attrs.id;
    const label = attrs.label || id; // default label to id
    const goal = attrs.goal || "";

    if (!id) {
      continue; // skip tags without id
    }

    // Parse comma-separated lists
    const files = parseCommaList(attrs.files || "");
    const tags = parseCommaList(attrs.tags || "");

    nodes.push({
      id,
      label,
      goal,
      files,
      tags,
      startIndex,
      endIndex,
    });
  }

  return nodes;
}

// Parse HTML-style attributes from a string
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};

  // Match key="value" or key='value' patterns
  const regex = /(\w+)=["']([^"']*?)["']/g;
  let match;

  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }

  return attrs;
}

// Parse comma-separated list, trim whitespace
function parseCommaList(value: string): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// Remove <node> tags from content (for passing clean content to LLM)
export function stripNodeTags(content: string): string {
  return content.replace(/<node\s+[^>]*?(?:\s*\/?)>/gi, "").trim();
}

// Check if content contains any <node> tags
export function hasNodeTags(content: string): boolean {
  return /<node\s+[^>]*?>/i.test(content);
}

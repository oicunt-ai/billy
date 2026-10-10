/**
 * Client-safe history content handling.
 *
 * Public history messages carry `string | structured-parts` content
 * (TextPart, ImagePart, ToolCallPart, ToolResultPart, ThinkingPart).
 * This milestone renders text only: text parts are joined, thinking parts
 * are always dropped (reasoning stays hidden), and non-text payloads have
 * no text rendering yet. No imports — safe for browser and server use.
 */

export function messageContentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object" || Array.isArray(part)) {
      continue;
    }
    const record = part as Record<string, unknown>;
    if (record["type"] === "text" && typeof record["text"] === "string") {
      parts.push(record["text"] as string);
    }
  }
  return parts.join("");
}

/** History roles collapse onto the two rendered presentations. */
export function toDisplayRole(role: unknown): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

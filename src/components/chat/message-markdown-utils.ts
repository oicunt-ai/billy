/**
 * Pure helpers for Markdown code rendering. No JSX, no runtime imports:
 * safe for `node --test` in addition to browser/server use.
 */

export type CodeChild = unknown;

export function languageOf(className: unknown): string {
  if (typeof className !== "string") {
    return "";
  }
  const match = className.split(" ").find((part) => part.startsWith("language-"));
  return match === undefined ? "" : match.slice("language-".length);
}

export function codeTextOf(children: CodeChild): string {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "boolean") {
    return "";
  }
  if (typeof children === "number" || typeof children === "bigint") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(codeTextOf).join("");
  }
  return "";
}

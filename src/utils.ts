/** Escape a string for safe interpolation into HomeMatic Script double-quoted strings. */
export function escapeHmScript(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/#/g, "\\#")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** Format a tool result as MCP text content. */
export function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

/** Try to parse JSON, return raw string on failure. */
export function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

/** Server version constant — single source of truth. */
export const VERSION = "0.1.0";

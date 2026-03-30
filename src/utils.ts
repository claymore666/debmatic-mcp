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

/**
 * Parse a CCU string value to a native JS type.
 * "19.000000" → 19, "true" → true, "false" → false, "" → null, else string.
 */
export function parseValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  const s = String(val);
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  const n = Number(s);
  if (!isNaN(n) && s.trim() !== "") return n;
  return s;
}

/**
 * Parse all values in a flat key-value object (e.g. paramset or datapoints).
 */
export function parseValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = parseValue(v);
  }
  return result;
}

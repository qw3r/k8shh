/**
 * Returns true only for values that are JSON objects or arrays — the cases
 * where pretty-printing is meaningful. Scalars like `"123"` or `"true"` are
 * intentionally treated as plain strings.
 */
export function isJson(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  const first = trimmed[0];
  if (first !== '{' && first !== '[') return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Pretty-print JSON with 2-space indent; returns the input unchanged if not JSON. */
export function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Collapse JSON to a single line; returns the input unchanged if not JSON. */
export function minify(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

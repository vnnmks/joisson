/* Framework-free JSON document model.
 * Mirrors the semantics of the Tk version (Joisson_tk/json_gui_editor.py):
 * paths, typed get/set, previews, unique-key generation, and the
 * "parse text or keep as string" coercion used by the form editors.
 */

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Key = string | number;
export type KeyPath = Key[];

export type JsonType = "object" | "array" | "string" | "number" | "boolean" | "null";

/** Serialize a path for use in Sets/Maps (expanded + selected state). */
export function pathKey(path: KeyPath): string {
  return JSON.stringify(path);
}

export function typeName(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "null";
  }
}

/** Short one-line preview, like the Tk tree's Value column. */
export function preview(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[...] (${value.length})`;
  if (typeof value === "object") return `{...} (${Object.keys(value).length})`;
  if (typeof value === "string") {
    const s = JSON.stringify(value);
    return s.length > 60 ? s.slice(0, 57) + "..." : s;
  }
  return String(value);
}

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

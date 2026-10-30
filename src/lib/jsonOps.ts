/* Path-based mutation helpers for the JSON document model. */

import { deepClone, type JsonValue, type KeyPath } from "./jsonModel";

/** Read the value at a path; throws on a missing segment. */
export function getAt(root: JsonValue, path: KeyPath): JsonValue {
  let cur: JsonValue = root;
  for (const seg of path) {
    if (Array.isArray(cur) && typeof seg === "number") {
      if (seg < 0 || seg >= cur.length) throw new Error(`Index ${seg} out of range`);
      cur = cur[seg];
    } else if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
      if (typeof seg !== "string" || !(seg in cur))
        throw new Error(`Key '${String(seg)}' not found`);
      cur = (cur as Record<string, JsonValue>)[seg];
    } else {
      throw new Error("Path does not exist");
    }
  }
  return cur;
}

/** Immutable set: returns a new root with the value at path replaced. */
export function setAt(root: JsonValue, path: KeyPath, value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const next = deepClone(root);
  let cur = next as JsonValue;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    if (Array.isArray(cur) && typeof seg === "number") cur = cur[seg];
    else cur = (cur as Record<string, JsonValue>)[seg as string];
  }
  const last = path[path.length - 1];
  if (Array.isArray(cur) && typeof last === "number") cur[last] = value;
  else (cur as Record<string, JsonValue>)[last as string] = value;
  return next;
}

/** Immutable delete of the node at path. Root itself cannot be deleted. */
export function deleteAt(root: JsonValue, path: KeyPath): JsonValue {
  if (path.length === 0) throw new Error("Cannot delete the root node");
  const next = deepClone(root);
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  const parent: JsonValue = parentPath.length === 0 ? next : getAt(next, parentPath);
  if (Array.isArray(parent) && typeof last === "number") parent.splice(last, 1);
  else delete (parent as Record<string, JsonValue>)[last as string];
  return next;
}

/** Rename a key inside an object parent. Returns the new root. */
export function renameKey(root: JsonValue, path: KeyPath, newKey: string): JsonValue {
  if (path.length === 0) throw new Error("Cannot rename the root node");
  const parentPath = path.slice(0, -1);
  const oldKey = path[path.length - 1];
  if (typeof oldKey !== "string") throw new Error("Can only rename keys of an object");
  const next = deepClone(root);
  const parent: JsonValue = parentPath.length === 0 ? next : getAt(next, parentPath);
  if (Array.isArray(parent)) throw new Error("Can only rename keys of an object");
  const obj = parent as Record<string, JsonValue>;
  if (newKey in obj) throw new Error(`Key '${newKey}' already exists`);
  obj[newKey] = obj[oldKey];
  delete obj[oldKey];
  return next;
}

/** Generate a unique sibling key: base, base_1, base_2, ... */
export function uniqueKey(obj: Record<string, JsonValue>, base: string): string {
  if (!(base in obj)) return base;
  let i = 1;
  while (`${base}_${i}` in obj) i++;
  return `${base}_${i}`;
}

/** Duplicate a node under its own parent. Returns { root, newPath }. */
export function duplicateAt(
  root: JsonValue,
  path: KeyPath,
): { root: JsonValue; newPath: KeyPath } {
  if (path.length === 0) throw new Error("Cannot duplicate the root node");
  const next = deepClone(root);
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1];
  const parent: JsonValue = parentPath.length === 0 ? next : getAt(next, parentPath);
  if (Array.isArray(parent) && typeof last === "number") {
    const copy = deepClone(parent[last]);
    parent.splice(last + 1, 0, copy);
    return { root: next, newPath: [...parentPath, last + 1] };
  }
  const obj = parent as Record<string, JsonValue>;
  const copy = deepClone(obj[last as string]);
  const newKey = uniqueKey(obj, `${String(last)}_copy`);
  obj[newKey] = copy;
  return { root: next, newPath: [...parentPath, newKey] };
}

/**
 * Parse editor text the way the Tk form fields do:
 * "" -> skipped by callers; valid JSON -> value; otherwise the raw string.
 */
export function parseJsonText(s: string): JsonValue {
  const t = (s ?? "").trim();
  if (t === "") throw new Error("empty");
  try {
    return JSON.parse(t) as JsonValue;
  } catch {
    return s;
  }
}

/** Display form of a leaf inside an <input>: strings raw, others as JSON. */
export function leafToText(value: JsonValue): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Immutable reorder of an array; out-of-range indices are clamped. */
export function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (items.length === 0) return items;
  const src = Math.max(0, Math.min(items.length - 1, from));
  const dst = Math.max(0, Math.min(items.length - 1, to));
  if (src === dst) return items;
  const next = [...items];
  const [moved] = next.splice(src, 1);
  next.splice(dst, 0, moved);
  return next;
}

export type DropPosition = "before" | "after" | "inside";

/** True when `prefix` is `path` itself or one of its ancestors. */
export function isPathPrefix(prefix: KeyPath, path: KeyPath): boolean {
  if (prefix.length > path.length) return false;
  return prefix.every((seg, i) => seg === path[i]);
}

/** Structural check for dropping `from` at `target`: no root moves, no moving a node into itself. */
export function canDropNode(from: KeyPath, target: KeyPath, position: DropPosition): boolean {
  if (from.length === 0) return false;
  if (isPathPrefix(from, target)) return false;
  if (position !== "inside" && target.length === 0) return false;
  return true;
}

/** Insert into an object next to `anchor`, preserving key order. Returns the key used. */
function insertIntoObject(
  obj: Record<string, JsonValue>,
  anchor: string,
  position: "before" | "after",
  key: string,
  value: JsonValue,
): string {
  const free = uniqueKey(obj, key || "item");
  const entries = Object.entries(obj);
  const at = entries.findIndex(([k]) => k === anchor);
  entries.splice(position === "before" ? at : at + 1, 0, [free, value]);
  for (const k of Object.keys(obj)) delete obj[k];
  for (const [k, v] of entries) obj[k] = v;
  return free;
}

/**
 * Immutable insert of a copy of `value` relative to `target`:
 * "inside" appends to the container, "before"/"after" place it as a sibling.
 * `keyHint` names the new key when the destination is an object.
 */
export function insertNode(
  root: JsonValue,
  target: KeyPath,
  position: DropPosition,
  value: JsonValue,
  keyHint: string,
): { root: JsonValue; newPath: KeyPath } {
  const next = deepClone(root);
  const copy = deepClone(value);
  if (position === "inside") {
    const container = getAt(next, target);
    if (Array.isArray(container)) {
      container.push(copy);
      return { root: next, newPath: [...target, container.length - 1] };
    }
    if (container !== null && typeof container === "object") {
      const obj = container as Record<string, JsonValue>;
      const key = uniqueKey(obj, keyHint || "item");
      obj[key] = copy;
      return { root: next, newPath: [...target, key] };
    }
    throw new Error("Can only place a node inside an object or array");
  }
  if (target.length === 0) throw new Error("Cannot place a node beside the root");
  const parentPath = target.slice(0, -1);
  const last = target[target.length - 1];
  const parent = getAt(next, parentPath);
  if (Array.isArray(parent)) {
    if (typeof last !== "number") throw new Error("Path does not exist");
    const idx = position === "before" ? last : last + 1;
    parent.splice(idx, 0, copy);
    return { root: next, newPath: [...parentPath, idx] };
  }
  if (parent !== null && typeof parent === "object") {
    const key = insertIntoObject(parent as Record<string, JsonValue>, String(last), position, keyHint, copy);
    return { root: next, newPath: [...parentPath, key] };
  }
  throw new Error("Cannot place a node here");
}

/** Immutable move of the node at `from` to `target`/`position`. Returns the new root and node path. */
export function moveNode(
  root: JsonValue,
  from: KeyPath,
  target: KeyPath,
  position: DropPosition,
): { root: JsonValue; newPath: KeyPath } {
  if (from.length === 0) throw new Error("Cannot move the root node");
  if (!canDropNode(from, target, position)) throw new Error("Cannot move a node into itself");
  const value = getAt(root, from);
  const lastSeg = from[from.length - 1];
  const keyHint = typeof lastSeg === "string" ? lastSeg : "item";
  const removed = deleteAt(root, from);
  // Removing an array item shifts later siblings (and their descendants) down by one.
  const parentLen = from.length - 1;
  let adjusted = target;
  if (typeof lastSeg === "number" && target.length > parentLen && isPathPrefix(from.slice(0, -1), target)) {
    const seg = target[parentLen];
    if (typeof seg === "number" && seg > lastSeg) {
      adjusted = [...target];
      adjusted[parentLen] = seg - 1;
    }
  }
  return insertNode(removed, adjusted, position, value, keyHint);
}

/** All descendant container paths of a value (for expand-all). */
export function collectContainerPaths(root: JsonValue): string[] {
  const out: string[] = [];
  const walk = (value: JsonValue, path: KeyPath) => {
    if (Array.isArray(value)) {
      out.push(JSON.stringify(path));
      value.forEach((v, i) => walk(v, [...path, i]));
    } else if (value !== null && typeof value === "object") {
      out.push(JSON.stringify(path));
      Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
    }
  };
  walk(root, []);
  return out;
}

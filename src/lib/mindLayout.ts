/* Layout engines for the mind map view.
 *
 * `buildMindTree` turns the JSON document into the visible node tree (honouring
 * the shared expanded set); `layoutMindTree` assigns document-space positions
 * with the chosen layout and builds the link paths. All pure — no DOM.
 */

import {
  pathKey,
  preview,
  typeName,
  type JsonType,
  type JsonValue,
  type KeyPath,
} from "./jsonModel";

export const NODE_H = 30;
export const ROOT_H = 36;
export const COL_GAP = 56;
export const ROW_GAP = 12;

export type MindLayoutId = "flow" | "reverse" | "split" | "outline" | "levels";

export interface MindLayoutDef {
  id: MindLayoutId;
  label: string;
  hint: string;
}

export const MIND_LAYOUTS: MindLayoutDef[] = [
  { id: "flow", label: "Flow", hint: "Left to right" },
  { id: "reverse", label: "Reverse", hint: "Right to left" },
  { id: "split", label: "Split", hint: "Both sides of root" },
  { id: "outline", label: "Outline", hint: "Top down" },
  { id: "levels", label: "Levels", hint: "Columns by depth" },
];

export interface MindNode {
  key: string;
  path: KeyPath;
  name: string;
  value: JsonValue;
  type: JsonType;
  depth: number;
  w: number;
  h: number;
  open: boolean;
  childCount: number;
  children: MindNode[];
}

export interface MindPoint {
  x: number;
  y: number;
}

export interface MindEdge {
  key: string;
  to: string;
  d: string;
}

export interface MindModel {
  order: MindNode[];
  pos: Map<string, MindPoint>;
  edges: MindEdge[];
  bounds: { x: number; y: number; w: number; h: number };
}

function nodeWidth(name: string, value: JsonValue, type: JsonType, childCount: number): number {
  const isContainer = type === "object" || type === "array";
  const nameW = Math.min(name.length, 24) * 6.9;
  const prevW = isContainer ? 0 : Math.min(preview(value).length, 20) * 6;
  const badgeW = isContainer && childCount > 0 ? 24 : 0;
  return Math.max(86, Math.min(238, 40 + nameW + (prevW ? 8 + prevW : 0) + badgeW));
}

function buildNode(
  path: KeyPath,
  name: string,
  value: JsonValue,
  depth: number,
  expanded: Set<string>,
): MindNode {
  const type = typeName(value);
  const isContainer = type === "object" || type === "array";
  const entries: Array<[string | number, JsonValue]> = !isContainer
    ? []
    : Array.isArray(value)
      ? value.map((v, i) => [i, v] as [number, JsonValue])
      : Object.entries(value as Record<string, JsonValue>);
  const key = pathKey(path);
  const open = expanded.has(key);
  const node: MindNode = {
    key,
    path,
    name,
    value,
    type,
    depth,
    w: nodeWidth(name, value, type, entries.length),
    h: depth === 0 ? ROOT_H : NODE_H,
    open,
    childCount: entries.length,
    children: [],
  };
  if (isContainer && open) {
    node.children = entries.map(([k, v]) =>
      buildNode([...path, k], Array.isArray(value) ? `[${k}]` : String(k), v, depth + 1, expanded),
    );
  }
  return node;
}

/** Visible mind-map tree for a document + expanded set. */
export function buildMindTree(data: JsonValue, expanded: Set<string>): MindNode {
  return buildNode([], "root", data, 0, expanded);
}

/* ---------------- layout helpers ---------------- */

type ExtentCache = Map<string, number>;

/** Stacked height of a node's whole subtree (vertical layouts). */
function vExtent(node: MindNode, cache: ExtentCache): number {
  const hit = cache.get(node.key);
  if (hit !== undefined) return hit;
  let total = node.h;
  if (node.children.length > 0) {
    let sum = 0;
    for (const c of node.children) sum += vExtent(c, cache);
    sum += ROW_GAP * (node.children.length - 1);
    total = Math.max(node.h, sum);
  }
  cache.set(node.key, total);
  return total;
}

/** Side-by-side width of a node's whole subtree (top-down layout). */
function hExtent(node: MindNode, cache: ExtentCache): number {
  const hit = cache.get(node.key);
  if (hit !== undefined) return hit;
  let total = node.w;
  if (node.children.length > 0) {
    let sum = 0;
    for (const c of node.children) sum += hExtent(c, cache);
    sum += COL_GAP * (node.children.length - 1);
    total = Math.max(node.w, sum);
  }
  cache.set(node.key, total);
  return total;
}

function groupHeight(list: MindNode[], cache: ExtentCache): number {
  if (list.length === 0) return 0;
  let sum = 0;
  for (const n of list) sum += vExtent(n, cache);
  return sum + ROW_GAP * (list.length - 1);
}

/** Children of `node` are centred vertically within its subtree band. */
function placeHorizontal(
  node: MindNode,
  anchor: number,
  top: number,
  dir: 1 | -1,
  pos: Map<string, MindPoint>,
  cache: ExtentCache,
) {
  const block = vExtent(node, cache);
  const x = dir === 1 ? anchor : anchor - node.w;
  pos.set(node.key, { x, y: top + (block - node.h) / 2 });
  if (node.children.length === 0) return;
  const childAnchor = dir === 1 ? x + node.w + COL_GAP : x - COL_GAP;
  let y = top;
  for (const child of node.children) {
    placeHorizontal(child, childAnchor, y, dir, pos, cache);
    y += vExtent(child, cache) + ROW_GAP;
  }
}

/** Classic two-sided mind map: root in the middle, branches both ways. */
function placeSplit(root: MindNode, pos: Map<string, MindPoint>) {
  const cache: ExtentCache = new Map();
  const right: MindNode[] = [];
  const left: MindNode[] = [];
  let rightH = 0;
  let leftH = 0;
  for (const child of root.children) {
    const extent = vExtent(child, cache);
    if (rightH <= leftH) {
      right.push(child);
      rightH += extent + ROW_GAP;
    } else {
      left.push(child);
      leftH += extent + ROW_GAP;
    }
  }
  pos.set(root.key, { x: 0, y: -root.h / 2 });

  let y = -groupHeight(right, cache) / 2;
  for (const child of right) {
    placeHorizontal(child, root.w + COL_GAP, y, 1, pos, cache);
    y += vExtent(child, cache) + ROW_GAP;
  }
  y = -groupHeight(left, cache) / 2;
  for (const child of left) {
    placeHorizontal(child, -COL_GAP, y, -1, pos, cache);
    y += vExtent(child, cache) + ROW_GAP;
  }
}

/** Org-chart layout: children spread over a row beneath their parent. */
function placeOutline(
  node: MindNode,
  left: number,
  top: number,
  pos: Map<string, MindPoint>,
  cache: ExtentCache,
) {
  const block = hExtent(node, cache);
  pos.set(node.key, { x: left + (block - node.w) / 2, y: top });
  if (node.children.length === 0) return;
  let kidsW = 0;
  for (const child of node.children) kidsW += hExtent(child, cache);
  kidsW += COL_GAP * (node.children.length - 1);
  let x = left + (block - kidsW) / 2;
  for (const child of node.children) {
    placeOutline(child, x, top + node.h + ROW_GAP, pos, cache);
    x += hExtent(child, cache) + COL_GAP;
  }
}

/** Layered columns: one column per depth, each node centred on its children. */
function placeLevels(root: MindNode, order: MindNode[], pos: Map<string, MindPoint>) {
  let maxDepth = 0;
  const colWidth: number[] = [];
  for (const n of order) {
    maxDepth = Math.max(maxDepth, n.depth);
    colWidth[n.depth] = Math.max(colWidth[n.depth] ?? 0, n.w);
  }
  const colX: number[] = [0];
  for (let d = 1; d <= maxDepth; d++) colX[d] = colX[d - 1] + (colWidth[d - 1] ?? 0) + COL_GAP;

  const yOf = new Map<string, number>();
  let row = 0;
  const walk = (n: MindNode): number => {
    if (n.children.length === 0) {
      const y = row * (NODE_H + ROW_GAP);
      row++;
      yOf.set(n.key, y);
      return y;
    }
    const ys = n.children.map(walk);
    const y = (ys[0] + ys[ys.length - 1]) / 2;
    yOf.set(n.key, y);
    return y;
  };
  walk(root);

  for (const n of order) {
    pos.set(n.key, {
      x: colX[n.depth] + ((colWidth[n.depth] ?? n.w) - n.w) / 2,
      y: yOf.get(n.key) ?? 0,
    });
  }
}

/** Curve between two nodes, entering each along its dominant axis. */
function edgePath(parent: MindNode, pp: MindPoint, child: MindNode, cp: MindPoint): string {
  const pcx = pp.x + parent.w / 2;
  const pcy = pp.y + parent.h / 2;
  const ccx = cp.x + child.w / 2;
  const ccy = cp.y + child.h / 2;
  const dx = ccx - pcx;
  const dy = ccy - pcy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x1 = dx >= 0 ? pp.x + parent.w : pp.x;
    const x2 = dx >= 0 ? cp.x : cp.x + child.w;
    const k = Math.max(18, Math.abs(x2 - x1) * 0.5) * (dx >= 0 ? 1 : -1);
    return `M ${x1} ${pcy} C ${x1 + k} ${pcy}, ${x2 - k} ${ccy}, ${x2} ${ccy}`;
  }
  const y1 = dy >= 0 ? pp.y + parent.h : pp.y;
  const y2 = dy >= 0 ? cp.y : cp.y + child.h;
  const k = Math.max(18, Math.abs(y2 - y1) * 0.5) * (dy >= 0 ? 1 : -1);
  return `M ${pcx} ${y1} C ${pcx} ${y1 + k}, ${ccx} ${y2 - k}, ${ccx} ${y2}`;
}

/** Layout one visible tree and return node positions, link paths and bounds. */
export function layoutMindTree(root: MindNode, layout: MindLayoutId): MindModel {
  const order: MindNode[] = [];
  const collect = (n: MindNode) => {
    order.push(n);
    n.children.forEach(collect);
  };
  collect(root);

  const pos = new Map<string, MindPoint>();
  switch (layout) {
    case "reverse":
      placeHorizontal(root, 0, 0, -1, pos, new Map());
      break;
    case "split":
      placeSplit(root, pos);
      break;
    case "outline":
      placeOutline(root, 0, 0, pos, new Map());
      break;
    case "levels":
      placeLevels(root, order, pos);
      break;
    default:
      placeHorizontal(root, 0, 0, 1, pos, new Map());
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of order) {
    const p = pos.get(n.key) ?? { x: 0, y: 0 };
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + n.w);
    maxY = Math.max(maxY, p.y + n.h);
  }
  if (order.length === 0) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }

  const edges: MindEdge[] = [];
  for (const n of order) {
    const pp = pos.get(n.key);
    if (!pp) continue;
    for (const child of n.children) {
      const cp = pos.get(child.key);
      if (!cp) continue;
      edges.push({
        key: `${n.key}>${child.key}`,
        to: child.key,
        d: edgePath(n, pp, child, cp),
      });
    }
  }

  return {
    order,
    pos,
    edges,
    bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
  };
}

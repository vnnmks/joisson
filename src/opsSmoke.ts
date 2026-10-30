// Unit smoke test for the JSON model + ops ported from the Tk version.
declare const process: { exit(code?: number): void };

import {
  duplicateAt,
  deleteAt,
  getAt,
  insertNode,
  moveArrayItem,
  moveNode,
  parseJsonText,
  renameKey,
  setAt,
  uniqueKey,
} from "./lib/jsonOps";
import { preview, typeName, pathKey, type JsonValue } from "./lib/jsonModel";
import { buildMindTree, layoutMindTree, MIND_LAYOUTS, type MindModel } from "./lib/mindLayout";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) failures++;
}

// get/set/delete
const doc: JsonValue = { a: { b: [1, 2, 3] }, s: "hi" };
check("getAt nested", getAt(doc, ["a", "b", 1]) === 2);
check("setAt immutability", getAt(doc, ["s"]) === "hi" && setAt(doc, ["s"], "yo") !== doc);
check("setAt value", getAt(setAt(doc, ["s"], "yo"), ["s"]) === "yo");
check("deleteAt array", (getAt(deleteAt(doc, ["a", "b", 0]), ["a", "b"]) as JsonValue[]).length === 2);
check("deleteAt key", !("s" in (deleteAt(doc, ["s"]) as object)));

// rename (Tk rename semantics: refuse existing key)
const ren = renameKey(doc, ["s"], "t");
check("renameKey", "t" in (ren as object) && !("s" in (ren as object)));
let dupErr = false;
try {
  renameKey(doc, ["a"], "s");
} catch {
  dupErr = true;
}
check("renameKey refuses existing", dupErr);

// duplicate (Tk duplicate: sibling key with _copy suffix)
const { root: dup, newPath } = duplicateAt(doc, ["s"]);
check("duplicateAt key", uniqueKey({ s: 1 } as never, "s_copy") === "s_copy" && getAt(dup, newPath) === "hi");
check("duplicateAt original intact", getAt(dup, ["s"]) === "hi");

// parseJsonText (Tk: "" -> None/skip, JSON -> value, else raw string)
check("parseJsonText number", parseJsonText("42") === 42);
check("parseJsonText invalid -> raw string", parseJsonText("hello") === "hello");
check("parseJsonText quoted string", parseJsonText('"x"') === "x");
let emptyErr = false;
try {
  parseJsonText("  ");
} catch {
  emptyErr = true;
}
check("parseJsonText empty throws (skip)", emptyErr);

// typeName + preview (Tk type_name/preview)
check("typeName null", typeName(null) === "null");
check("typeName array", typeName([1]) === "array");
check("preview object", preview({ a: 1, b: 2 }) === "{...} (2)");
check("preview array", preview([1, 2, 3]) === "[...] (3)");
check("preview long string truncates", preview("x".repeat(100)).length <= 60);

// pathKey serialization used for expanded/selected state
check("pathKey", pathKey(["a", 0]) === '["a",0]');

// moveArrayItem (visual array editor reordering)
check("moveArrayItem down", moveArrayItem(["a", "b", "c"], 0, 2).join("") === "bca");
check("moveArrayItem up", moveArrayItem(["a", "b", "c"], 2, 0).join("") === "cab");
check("moveArrayItem same index is a no-op", moveArrayItem(["a", "b"], 1, 1).length === 2);
check("moveArrayItem immutability", moveArrayItem(["a", "b"], 0, 1).join("") === "ba");
const arrIn = ["a", "b"];
check("moveArrayItem does not mutate input", moveArrayItem(arrIn, 0, 1) !== arrIn && arrIn[0] === "a");
check("moveArrayItem clamps", moveArrayItem(["a", "b"], 0, 99).join("") === "ba");

// mind map layouts: every visible node placed, no overlapping cards, link per edge
const mindDoc: JsonValue = {
  project: "Joisson",
  owner: { name: "Ada", tags: ["json", "editor"] },
  features: [
    { title: "Tree view", done: true },
    { title: "Mind map", done: false },
  ],
  notes: null,
};
const mindExpanded = new Set<string>([
  pathKey([]),
  pathKey(["owner"]),
  pathKey(["owner", "tags"]),
  pathKey(["features"]),
  pathKey(["features", 0]),
  pathKey(["features", 1]),
]);

function overlapCount(model: MindModel): number {
  const list = model.order.map((n) => ({ n, p: model.pos.get(n.key)! }));
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (
        a.p.x < b.p.x + b.n.w - 1 &&
        b.p.x < a.p.x + a.n.w - 1 &&
        a.p.y < b.p.y + b.n.h - 1 &&
        b.p.y < a.p.y + a.n.h - 1
      ) {
        count++;
      }
    }
  }
  return count;
}

for (const def of MIND_LAYOUTS) {
  const model = layoutMindTree(buildMindTree(mindDoc, mindExpanded), def.id);
  check(`mind ${def.id}: every node placed`, model.order.every((n) => model.pos.has(n.key)));
  check(`mind ${def.id}: no overlapping cards`, overlapCount(model) === 0);
  check(
    `mind ${def.id}: bounds cover every card`,
    model.order.every((n) => {
      const p = model.pos.get(n.key)!;
      return (
        p.x >= model.bounds.x - 0.01 &&
        p.y >= model.bounds.y - 0.01 &&
        p.x + n.w <= model.bounds.x + model.bounds.w + 0.01 &&
        p.y + n.h <= model.bounds.y + model.bounds.h + 0.01
      );
    }),
  );
  check(
    `mind ${def.id}: one link per visible child`,
    model.edges.length === model.order.reduce((sum, n) => sum + n.children.length, 0),
  );
}

const flowModel = layoutMindTree(buildMindTree(mindDoc, mindExpanded), "flow");
const reverseModel = layoutMindTree(buildMindTree(mindDoc, mindExpanded), "reverse");
check(
  "mind reverse mirrors flow",
  flowModel.order.every((n) => {
    const a = flowModel.pos.get(n.key)!;
    const b = reverseModel.pos.get(n.key)!;
    return Math.abs(b.y - a.y) < 0.01 && Math.abs(b.x + (a.x + n.w)) < 0.01;
  }),
);

const splitModel = layoutMindTree(buildMindTree(mindDoc, mindExpanded), "split");
check(
  "mind split grows on both sides of root",
  splitModel.order.some((n) => n.depth > 0 && splitModel.pos.get(n.key)!.x + n.w <= 0) &&
    splitModel.order.some((n) => n.depth > 0 && splitModel.pos.get(n.key)!.x >= 36),
);

const outlineModel = layoutMindTree(buildMindTree(mindDoc, mindExpanded), "outline");
check(
  "mind outline stacks children below parents",
  outlineModel.order
    .filter((n) => n.depth > 0)
    .every((n) => {
      const parent = outlineModel.order.find((q) => q.children.includes(n))!;
      return outlineModel.pos.get(n.key)!.y >= outlineModel.pos.get(parent.key)!.y + parent.h;
    }),
);

const levelsModel = layoutMindTree(buildMindTree(mindDoc, mindExpanded), "levels");
check(
  "mind levels keeps depth in columns",
  levelsModel.order.every((a) =>
    levelsModel.order.every(
      (b) =>
        a.depth >= b.depth ||
        levelsModel.pos.get(a.key)!.x + a.w < levelsModel.pos.get(b.key)!.x,
    ),
  ),
);

check(
  "mind tree honours the expanded set",
  buildMindTree(mindDoc, new Set([pathKey([])])).children.length === 4 &&
    buildMindTree(mindDoc, new Set([pathKey([]), pathKey(["owner"])])).children.find(
      (n) => n.key === pathKey(["owner"]),
    )!.children.length === 2,
);

// moveNode / insertNode (tree drag-and-drop + paste)
const mv: JsonValue = { a: { x: 1 }, b: { y: 2 }, list: [10, 20, 30] };
const mvInto = moveNode(mv, ["a"], ["b"], "inside");
check("moveNode inside object", getAt(mvInto.root, ["b", "a", "x"]) === 1 && !("a" in (mvInto.root as object)));
check("moveNode returns new path", pathKey(mvInto.newPath) === pathKey(["b", "a"]));
const mvArr = moveNode(mv, ["list", 0], ["list", 2], "after");
check("moveNode array reorder adjusts index", (getAt(mvArr.root, ["list"]) as JsonValue[]).join(",") === "20,30,10");
check("moveNode array newPath", pathKey(mvArr.newPath) === pathKey(["list", 2]));
const mvBefore = moveNode(mv, ["b"], ["a"], "before");
check("moveNode before keeps key order", Object.keys(mvBefore.root as object).join(",") === "b,a,list");
let selfErr = false;
try {
  moveNode(mv, ["a"], ["a", "x"], "inside");
} catch {
  selfErr = true;
}
check("moveNode refuses moving into itself", selfErr);
let rootMoveErr = false;
try {
  moveNode(mv, [], ["a"], "inside");
} catch {
  rootMoveErr = true;
}
check("moveNode refuses root", rootMoveErr);
const pasteKey = insertNode(mv, [], "inside", 5, "a");
check("insertNode makes key unique", getAt(pasteKey.root, ["a_1"]) === 5);
check("insertNode does not mutate input", !("a_1" in (mv as object)));
const pasteArr = insertNode(mv, ["list", 1], "after", 99, "item");
check("insertNode array sibling", (getAt(pasteArr.root, ["list"]) as JsonValue[]).join(",") === "10,20,99,30");

if (failures > 0) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
console.log("ALL JSON OPS TESTS PASSED");

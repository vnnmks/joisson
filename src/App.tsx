import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus2,
  FolderOpen,
  Save,
  Copy,
  ChevronsUpDown,
  ChevronsDownUp,
  Plus,
  Pencil,
  Trash2,
  CopyPlus,
  Tag,
} from "lucide-react";
import { JsonTree, type TreeMenuRequest } from "./components/JsonTree";
import { MindMap } from "./components/MindMap";
import { type MindLayoutId } from "./lib/mindLayout";
import { ObjectEditor, ObjectForm, inferObjectSchema } from "./components/ObjectEditor";
import { ArrayEditor, ArrayForm } from "./components/ArrayEditor";
import { ValueEditor } from "./components/ValueEditor";
import { MultiAdd } from "./components/MultiAdd";
import { ToastProvider, useToasts } from "./components/Toasts";
import { openJsonFile, saveJsonFile } from "./lib/files";
import {
  collectContainerPaths,
  deleteAt,
  duplicateAt,
  getAt,
  insertNode,
  isPathPrefix,
  leafToText,
  moveNode,
  renameKey,
  setAt,
  type DropPosition,
} from "./lib/jsonOps";
import { deepClone, pathKey, typeName, type JsonValue, type KeyPath } from "./lib/jsonModel";

type EditDialogState =
  | { kind: "object"; path: KeyPath; title: string }
  | { kind: "leaf"; path: KeyPath; title: string }
  | { kind: "array"; path: KeyPath; title: string }
  | null;

type AddDialogState =
  | { kind: "child"; path: KeyPath }
  | { kind: "multi"; path: KeyPath; title: string; isDict: boolean }
  | null;

function displayName(path: KeyPath): string {
  if (path.length === 0) return "root";
  return String(path[path.length - 1]);
}

/** Short name of a node for menus and status: root, its key, or [index]. */
function nodeLabel(path: KeyPath): string {
  if (path.length === 0) return "root";
  const last = path[path.length - 1];
  return typeof last === "number" ? `[${last}]` : last;
}

/** A copied node waiting to be pasted. `key` names it when pasted into an object. */
interface NodeClipboard {
  label: string;
  key: string;
  value: JsonValue;
}

/** Human-readable location of a node, e.g. root.items[0].name */
function pathLabel(path: KeyPath | null): string {
  if (path === null || path.length === 0) return "root";
  let out = "root";
  for (const seg of path) {
    out += typeof seg === "number" ? `[${seg}]` : `.${seg}`;
  }
  return out;
}

/* Preferences remembered between launches (localStorage). */

const PANEL_VIEW_KEY = "joisson.panelView";
const PANEL_JSON_EDIT_KEY = "joisson.panelJsonEdit";

type PanelView = "json" | "form";
type LeftView = "tree" | "mind";

function loadPanelView(): PanelView {
  try {
    return localStorage.getItem(PANEL_VIEW_KEY) === "form" ? "form" : "json";
  } catch {
    return "json";
  }
}

function loadJsonEditPref(): boolean {
  try {
    return localStorage.getItem(PANEL_JSON_EDIT_KEY) === "1";
  } catch {
    return false;
  }
}

function savePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — preferences simply aren't remembered */
  }
}

function Shell() {
  const { toast, confirm } = useToasts();
  const [data, setData] = useState<JsonValue>({});
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("untitled.json");
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([pathKey([])]));
  const [selected, setSelected] = useState<KeyPath | null>([]);
  const [menu, setMenu] = useState<TreeMenuRequest | null>(null);
  const [clipboard, setClipboard] = useState<NodeClipboard | null>(null);
  const [editDlg, setEditDlg] = useState<EditDialogState>(null);
  const [addDlg, setAddDlg] = useState<AddDialogState>(null);
  const [renameDraft, setRenameDraft] = useState<{ path: KeyPath; value: string } | null>(null);
  const [promptDraft, setPromptDraft] = useState<{
    title: string;
    label: string;
    value: string;
    onOk: (v: string) => void;
  } | null>(null);
  const [status, setStatus] = useState("Ready");
  // Restore the right-panel setup from the last run (panel view + JSON edit).
  const [panelView, setPanelView] = useState<PanelView>(loadPanelView);
  const [leftView, setLeftView] = useState<LeftView>("tree");
  const [mindLayout, setMindLayout] = useState<MindLayoutId>("flow");
  const [jsonEditing, setJsonEditing] = useState<boolean>(loadJsonEditPref);
  // A restored edit session starts from the initial empty document.
  const [jsonDraft, setJsonDraft] = useState(() => (loadJsonEditPref() ? "{}" : ""));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const treeWrapRef = useRef<HTMLDivElement>(null);

  const selectedValue: JsonValue | undefined = useMemo(() => {
    if (selected === null) return undefined;
    try {
      return getAt(data, selected);
    } catch {
      return undefined;
    }
  }, [data, selected]);

  const selectedType = selectedValue === undefined ? "—" : typeName(selectedValue);

  // The right panel always shows the selected node (the whole document at root).
  const outputValue: JsonValue =
    selected === null || selectedValue === undefined ? data : selectedValue;

  const outputText = useMemo(() => {
    try {
      return JSON.stringify(outputValue, null, 2) ?? "null";
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : e}`;
    }
  }, [outputValue]);

  const selectPath = useCallback(
    (path: KeyPath) => {
      setSelected(path);
      try {
        const v = getAt(data, path);
        const t = typeName(v);
        const extra =
          t === "object"
            ? ` (${Object.keys(v as object).length} fields)`
            : t === "array"
              ? ` (${(v as unknown[]).length} items)`
              : `: ${leafToText(v)}`;
        setStatus(`Selected: ${path.length === 0 ? "root" : displayName(path)} (${t})${extra}`);
      } catch {
        setStatus("Ready");
      }
    },
    [data],
  );

  const toggle = useCallback((path: KeyPath) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const k = pathKey(path);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const applyData = useCallback(
    (next: JsonValue, select: KeyPath | null | undefined, msg?: string) => {
      setData(next);
      if (select !== undefined) setSelected(select);
      setDirty(true);
      if (msg) {
        setStatus(msg);
        toast(msg, "success");
      }
    },
    [toast],
  );


  /* ---------------- file actions ---------------- */

  const doNew = useCallback(async () => {
    if (!(await confirm("Discard current JSON and start empty?"))) return;
    setData({});
    setFilePath(null);
    setFileName("untitled.json");
    setDirty(false);
    setSelected([]);
    setExpanded(new Set([pathKey([])]));
    setStatus("New document");
  }, [confirm]);

  const doOpen = useCallback(async () => {
    try {
      const f = await openJsonFile();
      if (!f) return;
      const parsed = JSON.parse(f.content) as JsonValue;
      setData(parsed);
      setFilePath(f.path);
      setFileName(f.name);
      setDirty(false);
      setSelected([]);
      setExpanded(new Set([pathKey([])]));
      setStatus(`Opened: ${f.name}`);
    } catch (e) {
      toast(`Open failed: ${e instanceof Error ? e.message : e}`, "error");
    }
  }, [toast]);

  const doSave = useCallback(
    async (saveAs = false) => {
      try {
        const text = JSON.stringify(data, null, 2);
        const target = await saveJsonFile(fileName, text, saveAs ? null : filePath);
        if (target === null && !saveAs) {
          setStatus("Saved (downloaded)");
          setDirty(false);
          return;
        }
        if (target === null) return;
        setFilePath(target);
        setFileName(target.split(/[\\/]/).pop() ?? target);
        setDirty(false);
        setStatus(`Saved: ${target}`);
        toast("Saved", "success");
      } catch (e) {
        toast(`Save failed: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, fileName, filePath, toast],
  );

  const copyOutput = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(outputText);
      setStatus("Copied to clipboard");
      toast("Copied to clipboard", "success");
    } catch {
      toast("Copy failed", "error");
    }
  }, [outputText, toast]);

  /* ---------------- right panel ---------------- */

  const startJsonEdit = useCallback(() => {
    setJsonDraft(outputText);
    setJsonError(null);
    setJsonEditing(true);
  }, [outputText]);

  const stopJsonEdit = useCallback(() => {
    setJsonEditing(false);
    setJsonError(null);
  }, []);

  /** Apply the right-panel JSON draft to the selected node. */
  const commitJsonEdit = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonDraft) as JsonValue;
      const path = selected ?? [];
      applyData(setAt(data, path, parsed), path, `Updated ${displayName(path)}`);
      // Edit mode is a sticky toggle: keep it on and show the canonical text.
      setJsonDraft(JSON.stringify(parsed, null, 2) ?? "null");
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }, [data, selected, jsonDraft, applyData]);

  useEffect(() => {
    savePref(PANEL_VIEW_KEY, panelView);
  }, [panelView]);

  useEffect(() => {
    savePref(PANEL_JSON_EDIT_KEY, jsonEditing ? "1" : "0");
  }, [jsonEditing]);

  // Edit mode is sticky: moving to another node keeps the JSON editor open and
  // reloads the draft with that node, instead of dropping back to read-only.
  const selectedPathKey = selected === null ? "" : pathKey(selected);
  const draftPathRef = useRef(selectedPathKey);
  useEffect(() => {
    if (draftPathRef.current === selectedPathKey) return;
    draftPathRef.current = selectedPathKey;
    setJsonError(null);
    if (jsonEditing) setJsonDraft(outputText);
  }, [selectedPathKey, jsonEditing, outputText]);

  /* ---------------- tree actions ---------------- */

  const openEdit = useCallback(
    (path: KeyPath) => {
      let current: JsonValue;
      try {
        current = getAt(data, path);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
        return;
      }
      const t = typeName(current);
      const title = `Edit ${displayName(path)}`;
      if (t === "object") setEditDlg({ kind: "object", path, title });
      else if (t === "array") setEditDlg({ kind: "array", path, title });
      else setEditDlg({ kind: "leaf", path, title });
    },
    [data, toast],
  );

  const commitEdit = useCallback(
    (path: KeyPath, value: JsonValue) => {
      try {
        const next = setAt(data, path, value);
        applyData(next, path, `Updated ${displayName(path)}`);
        setEditDlg(null);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, applyData, toast],
  );

  const doRename = useCallback(
    (path: KeyPath) => {
      if (path.length === 0) {
        toast("Cannot rename root.", "error");
        return;
      }
      setRenameDraft({ path, value: String(path[path.length - 1]) });
    },
    [toast],
  );

  const commitRename = useCallback(
    (newKey: string) => {
      if (!renameDraft) return;
      const trimmed = newKey.trim();
      const oldKey = String(renameDraft.path[renameDraft.path.length - 1]);
      if (!trimmed || trimmed === oldKey) {
        setRenameDraft(null);
        return;
      }
      try {
        const next = renameKey(data, renameDraft.path, trimmed);
        const newPath = [...renameDraft.path.slice(0, -1), trimmed];
        applyData(next, newPath, `Renamed to '${trimmed}'`);
      } catch (e) {
        toast(`Rename failed: ${e instanceof Error ? e.message : e}`, "error");
      }
      setRenameDraft(null);
    },
    [data, renameDraft, applyData, toast],
  );

  const doDuplicate = useCallback(
    (path: KeyPath) => {
      try {
        const { root, newPath } = duplicateAt(data, path);
        applyData(root, newPath, `Duplicated '${displayName(path)}'`);
      } catch (e) {
        toast(`${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, applyData, toast],
  );

  const doCopy = useCallback(
    (path: KeyPath) => {
      try {
        const value = deepClone(getAt(data, path));
        const last = path[path.length - 1];
        const label = nodeLabel(path);
        setClipboard({ label, key: typeof last === "string" ? last : "item", value });
        setStatus(`Copied '${label}'`);
        toast(`Copied '${label}'`, "success");
      } catch (e) {
        toast(`Copy failed: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, toast],
  );

  const doPaste = useCallback(
    (path: KeyPath) => {
      if (!clipboard) return;
      try {
        const t = typeName(getAt(data, path));
        const isContainer = t === "object" || t === "array";
        if (!isContainer && path.length === 0) {
          toast("Select an object or array to paste into.", "error");
          return;
        }
        // Containers receive the paste as a child; leaves get it as the next sibling.
        const { root, newPath } = insertNode(
          data,
          path,
          isContainer ? "inside" : "after",
          clipboard.value,
          clipboard.key,
        );
        setExpanded((prev) => new Set(prev).add(pathKey(newPath.slice(0, -1))));
        applyData(root, newPath, `Pasted '${clipboard.label}'`);
      } catch (e) {
        toast(`Paste failed: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, clipboard, applyData, toast],
  );

  /** Drag-and-drop in the tree: move a node before/after/inside another. */
  const doMove = useCallback(
    (from: KeyPath, target: KeyPath, position: DropPosition) => {
      try {
        const { root, newPath } = moveNode(data, from, target, position);
        setExpanded((prev) => {
          const next = new Set<string>();
          for (const k of prev) {
            // Keep the moved subtree's expanded state under its new location.
            const p = JSON.parse(k) as KeyPath;
            next.add(isPathPrefix(from, p) ? pathKey([...newPath, ...p.slice(from.length)]) : k);
          }
          next.add(pathKey(newPath.slice(0, -1)));
          return next;
        });
        applyData(root, newPath, `Moved '${nodeLabel(from)}'`);
      } catch (e) {
        toast(`Move failed: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, applyData, toast],
  );

  const doDelete = useCallback(
    async (path: KeyPath) => {
      if (path.length === 0) {
        if (await confirm("Clear entire JSON (reset to empty object)?")) {
          setData({});
          setSelected([]);
          setDirty(true);
          setStatus("Cleared");
        }
        return;
      }
      if (!(await confirm(`Delete '${displayName(path)}'?`))) return;
      try {
        const next = deleteAt(data, path);
        applyData(next, path.slice(0, -1), `Deleted '${displayName(path)}'`);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
      }
    },
    [data, applyData, confirm, toast],
  );

  const doDeleteChildren = useCallback(
    async (path: KeyPath) => {
      let current: JsonValue;
      try {
        current = getAt(data, path);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
        return;
      }
      const isObj = current !== null && typeof current === "object" && !Array.isArray(current);
      const isArr = Array.isArray(current);
      if (!isObj && !isArr) {
        toast("Selected node has no children.", "error");
        return;
      }
      const empty = isObj
        ? Object.keys(current as object).length === 0
        : (current as unknown[]).length === 0;
      if (empty) {
        toast("No children to delete.", "info");
        return;
      }
      if (
        !(await confirm(
          isObj ? "Delete all children of this object?" : "Delete all items of this array?",
        ))
      ) {
        return;
      }
      applyData(setAt(data, path, isObj ? {} : []), path, "Children deleted");
    },
    [data, applyData, confirm, toast],
  );

  /* ---------------- add actions ---------------- */

  /** Add a child to the container at path (Tk add_child semantics). */
  const doAddChild = useCallback(
    (path: KeyPath, defaultValue?: JsonValue, hasDefault = false) => {
      let container: JsonValue;
      try {
        container = getAt(data, path);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
        return;
      }
      if (container !== null && typeof container === "object" && !Array.isArray(container)) {
        const obj = container as Record<string, JsonValue>;
        setPromptDraft({
          title: "Add Field",
          label: "Key name",
          value: "",
          onOk: (key) => {
            const k = key.trim();
            if (!k) return;
            if (k in obj) {
              toast("Key already exists.", "error");
              return;
            }
            if (hasDefault) {
              applyData(setAt(data, [...path, k], defaultValue as JsonValue), [...path, k], `Added '${k}'`);
            } else {
              // Ask for the value with the raw JSON editor (Tk ask_value).
              setAddDlg({ kind: "child", path: [...path, k] });
            }
          },
        });
      } else if (Array.isArray(container)) {
        if (hasDefault) {
          applyData(
            setAt(data, [...path, container.length], defaultValue as JsonValue),
            [...path, container.length],
            "Added item",
          );
        } else {
          setAddDlg({ kind: "child", path: [...path, container.length] });
        }
      } else {
        toast("Select an object or array node to add a child.", "error");
      }
    },
    [data, applyData, toast],
  );

  /** Add-entry dialog value commit for the pending child path. */
  const commitAddChildValue = useCallback(
    (value: JsonValue) => {
      if (addDlg?.kind !== "child") return;
      try {
        applyData(setAt(data, addDlg.path, value), addDlg.path, `Added '${displayName(addDlg.path)}'`);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
      }
      setAddDlg(null);
    },
    [data, addDlg, applyData, toast],
  );

  /** Multi-add (Tk add_via_form): batch-add items to a collection of objects. */
  const doMultiAdd = useCallback(
    (path: KeyPath) => {
      let container: JsonValue;
      try {
        container = getAt(data, path);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
        return;
      }
      const isDict = container !== null && typeof container === "object" && !Array.isArray(container);
      const children: JsonValue[] = isDict
        ? Object.values(container as Record<string, JsonValue>)
        : Array.isArray(container)
          ? [...container]
          : [];
      const objectMode =
        children.length > 0 &&
        children.every((c) => c !== null && typeof c === "object" && !Array.isArray(c));
      if (!objectMode) {
        // Non-object collections fall back to the generic single add.
        doAddChild(path);
        return;
      }
      const label = path.length === 0 ? "root" : displayName(path);
      setAddDlg({ kind: "multi", path, title: `Add to ${label}`, isDict });
    },
    [data, doAddChild, toast],
  );

  const commitMultiAdd = useCallback(
    (items: Array<[string, Record<string, JsonValue>]>) => {
      if (addDlg?.kind !== "multi" || items.length === 0) {
        setAddDlg(null);
        return;
      }
      try {
        let next = data;
        let newPath: KeyPath = addDlg.path;
        const parent = getAt(next, addDlg.path);
        if (addDlg.isDict && parent !== null && typeof parent === "object" && !Array.isArray(parent)) {
          const obj = { ...(parent as Record<string, JsonValue>) };
          const used = new Set(Object.keys(obj));
          for (const [keyVal, itemDict] of items) {
            let key = keyVal || "new";
            if (used.has(key)) {
              const base = keyVal || "new";
              let i = keyVal ? 2 : 1;
              key = `${base}_${i}`;
              while (used.has(key)) {
                i++;
                key = `${base}_${i}`;
              }
            }
            used.add(key);
            obj[key] = itemDict;
            newPath = [...addDlg.path, key];
          }
          next = setAt(next, addDlg.path, obj);
        } else if (Array.isArray(parent)) {
          const arr = [...parent];
          for (const [, itemDict] of items) arr.push(itemDict);
          next = setAt(next, addDlg.path, arr);
          newPath = [...addDlg.path, arr.length - 1];
        }
        applyData(next, newPath, `Added ${items.length} item${items.length > 1 ? "s" : ""}`);
      } catch (e) {
        toast(`Error: ${e instanceof Error ? e.message : e}`, "error");
      }
      setAddDlg(null);
    },
    [data, addDlg, applyData, toast],
  );

  /* ---------------- expand/collapse + shortcuts ---------------- */

  const expandAll = useCallback(() => {
    setExpanded(new Set(collectContainerPaths(data)));
    setStatus("Expanded all");
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set([pathKey([])]));
    setStatus("Collapsed all");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        e.preventDefault();
        void doNew();
      } else if (k === "o") {
        e.preventDefault();
        void doOpen();
      } else if (k === "s") {
        e.preventDefault();
        void doSave(e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doNew, doOpen, doSave]);

  // Close the floating context menu on outside click / scroll / escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const menuValue: JsonValue | undefined = useMemo(() => {
    if (!menu) return undefined;
    try {
      return getAt(data, menu.path);
    } catch {
      return undefined;
    }
  }, [data, menu]);
  const menuType = menuValue === undefined ? null : typeName(menuValue);
  const menuTargetLabel =
    menu && menuType && (menuType === "object" || menuType === "array") && menu.path.length > 0
      ? String(menu.path[menu.path.length - 1])
      : null;

  /* ---------------- render ---------------- */

  const menuEditLabel =
    menu && menuType
      ? menuType === "object" || menuType === "array"
        ? `Edit ${menuTargetLabel ?? "root"}`
        : "Edit Value"
      : "Edit";

  const editInitial = editDlg
    ? (() => {
        try {
          return getAt(data, editDlg.path);
        } catch {
          return null;
        }
      })()
    : null;

  return (
    <div className="flex h-full flex-col bg-[#0b1020] text-[#e5ecff]">
      <header data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2 bg-[#1a1d27] px-3">
        <span className="text-[15px] font-bold text-[#e5ecff]">◈</span>
        <span className="text-[13px] font-bold">Joisson</span>
        <span className="ml-1 truncate text-xs text-[#8b93a7]">
          {fileName}
          {dirty ? " •" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <HeaderBtn title="New (Ctrl+N)" onClick={() => void doNew()}>
            <FilePlus2 size={15} />
          </HeaderBtn>
          <HeaderBtn title="Open (Ctrl+O)" onClick={() => void doOpen()}>
            <FolderOpen size={15} />
          </HeaderBtn>
          <HeaderBtn title="Save (Ctrl+S)" onClick={() => void doSave(false)} primary>
            <Save size={15} />
          </HeaderBtn>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-[#1c2340] bg-[#10162b] px-2 py-1.5">
        <ToolBtn icon={<Plus size={14} />} label="Add Field" onClick={() => selected && doAddChild(selected)} disabled={!selected} />
        <ToolBtn icon={<Pencil size={14} />} label="Edit" onClick={() => selected && openEdit(selected)} disabled={!selected} />
        <ToolBtn
          icon={<Tag size={14} />}
          label="Rename"
          onClick={() => selected && doRename(selected)}
          disabled={!selected || (selected?.length ?? 0) === 0}
        />
        <ToolBtn icon={<CopyPlus size={14} />} label="Duplicate" onClick={() => selected && doDuplicate(selected)} disabled={!selected} />
        <ToolBtn icon={<Trash2 size={14} />} label="Delete" danger onClick={() => selected && void doDelete(selected)} disabled={!selected} />
        <span className="mx-1 h-5 w-px bg-[#232b47]" />
        <ToolBtn icon={<ChevronsUpDown size={14} />} label="Expand All" onClick={expandAll} />
        <ToolBtn icon={<ChevronsDownUp size={14} />} label="Collapse All" onClick={collapseAll} />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-[3] flex-col border-r border-[#1c2340] p-2">
          <div className="mb-1.5 flex shrink-0 items-center gap-2">
            <div className="flex shrink-0 rounded-md border border-[#232b47] bg-[#0b1020] p-0.5 text-[11.5px]">
              <button
                onClick={() => setLeftView("tree")}
                className={`rounded px-2 py-0.5 ${
                  leftView === "tree"
                    ? "bg-[#2f6fed] text-white"
                    : "text-[#c7ccd9] hover:text-white"
                }`}
              >
                Tree
              </button>
              <button
                onClick={() => setLeftView("mind")}
                className={`rounded px-2 py-0.5 ${
                  leftView === "mind"
                    ? "bg-[#2f6fed] text-white"
                    : "text-[#c7ccd9] hover:text-white"
                }`}
              >
                Mind map
              </button>
            </div>
            {leftView === "mind" && (
              <span className="truncate text-[10.5px] text-[#6b7691]">
                drag to pan · ctrl+scroll to zoom
              </span>
            )}
          </div>
          <div
            ref={treeWrapRef}
            className={
              leftView === "tree"
                ? "min-h-0 flex-1 overflow-auto rounded-lg bg-[#0b1020] px-1"
                : "min-h-0 flex-1 overflow-hidden rounded-lg border border-[#1a2340] bg-[#0b1020]"
            }
          >
            {leftView === "tree" ? (
              <JsonTree
                data={data}
                expanded={expanded}
                selected={selected}
                onToggle={toggle}
                onSelect={selectPath}
                onEdit={openEdit}
                onRename={doRename}
                onMenu={setMenu}
                onMove={doMove}
              />
            ) : (
              <MindMap
                data={data}
                expanded={expanded}
                selected={selected}
                layout={mindLayout}
                onLayoutChange={setMindLayout}
                onToggle={toggle}
                onSelect={selectPath}
                onEdit={openEdit}
                onMenu={setMenu}
              />
            )}
          </div>
          <div className="mt-2 shrink-0 truncate rounded-md bg-[#141b30] px-2 py-1 text-xs text-[#8b93a7]">
            {status}
          </div>
        </div>
        <div className="flex min-w-0 flex-[2] flex-col bg-[#0d1428] p-2">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 rounded-md border border-[#232b47] bg-[#0b1020] p-0.5 text-[11.5px]">
              <button
                onClick={() => setPanelView("json")}
                className={`rounded px-2 py-0.5 ${
                  panelView === "json"
                    ? "bg-[#2f6fed] text-white"
                    : "text-[#c7ccd9] hover:text-white"
                }`}
              >
                Selected JSON
              </button>
              <button
                onClick={() => {
                  setPanelView("form");
                  stopJsonEdit();
                }}
                className={`rounded px-2 py-0.5 ${
                  panelView === "form"
                    ? "bg-[#2f6fed] text-white"
                    : "text-[#c7ccd9] hover:text-white"
                }`}
              >
                Form
              </button>
            </div>
            <span className="font-mono-app min-w-0 truncate text-[11px] text-[#8b93a7]" title={pathLabel(selected)}>
              {pathLabel(selected)}
            </span>
            {panelView === "json" && (
              <button
                onClick={() => (jsonEditing ? stopJsonEdit() : startJsonEdit())}
                title={jsonEditing ? "Stop editing JSON" : "Edit JSON"}
                className={`ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  jsonEditing
                    ? "bg-[#2f6fed] text-white hover:bg-[#4a86ff]"
                    : "text-[#c7ccd9] hover:bg-[#222942] hover:text-white"
                }`}
              >
                <Pencil size={13} /> {jsonEditing ? "Cancel" : "Edit"}
              </button>
            )}
            {!jsonEditing && (
              <button
                onClick={() => void copyOutput()}
                className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-[#c7ccd9] hover:bg-[#222942] hover:text-white ${
                  panelView === "form" ? "ml-auto" : ""
                }`}
              >
                <Copy size={13} /> Copy
              </button>
            )}
          </div>
          {panelView === "json" ? (
            jsonEditing ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <textarea
                  value={jsonDraft}
                  onChange={(e) => {
                    setJsonDraft(e.target.value);
                    setJsonError(null);
                  }}
                  spellCheck={false}
                  aria-label="Edit selected JSON"
                  className="font-mono-app min-h-0 flex-1 resize-none overflow-auto rounded-lg border border-[#2a3350] bg-[#0b1020] p-3 text-[12.5px] leading-relaxed text-[#c7ccd9] outline-none focus:border-[#6a8dff]"
                />
                {jsonError && <p className="mt-1 text-xs text-[#ff7a7a]">{jsonError}</p>}
                <div className="mt-2 flex shrink-0 items-center justify-end gap-2">
                  <button
                    onClick={stopJsonEdit}
                    className="rounded-lg px-3 py-1 text-sm text-[#c7ccd9] hover:bg-[#222942]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={commitJsonEdit}
                    className="rounded-lg bg-[#2f6fed] px-3 py-1 text-sm font-semibold text-white hover:bg-[#4a86ff]"
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : (
              <pre className="font-mono-app min-h-0 flex-1 overflow-auto rounded-lg bg-[#0b1020] p-3 text-[12.5px] leading-relaxed text-[#c7ccd9]">
                {outputText}
              </pre>
            )
          ) : selected === null || selectedValue === undefined ? (
            <p className="text-xs text-[#8b93a7]">Select a node in the tree to edit it.</p>
          ) : selectedType === "object" ? (
            <ObjectForm
              key={`${pathKey(selected)}:${outputText}`}
              variant="inline"
              title=""
              schema={inferObjectSchema(selectedValue)}
              initial={selectedValue as Record<string, JsonValue>}
              coerceJson
              onDone={(r) => commitEdit(selected, r)}
              onCancel={() => setPanelView("json")}
            />
          ) : selectedType === "array" ? (
            <ArrayForm
              key={`${pathKey(selected)}:${outputText}`}
              variant="inline"
              title=""
              initial={selectedValue as JsonValue[]}
              onDone={(r) => commitEdit(selected, r)}
              onCancel={() => setPanelView("json")}
            />
          ) : (
            <ObjectForm
              key={`${pathKey(selected)}:${outputText}`}
              variant="inline"
              title=""
              schema={{ value: { type: "leaf" } }}
              initial={{ value: selectedValue }}
              coerceJson={false}
              onDone={(r) => commitEdit(selected, r.value ?? selectedValue)}
              onCancel={() => setPanelView("json")}
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[#1c2340] bg-[#10162b] px-3 py-1 text-xs text-[#8b93a7]">
        <span>
          Selected:{" "}
          <span className="text-[#c7ccd9]">
            {selected === null || selected.length === 0 ? "root" : displayName(selected)}
          </span>
        </span>
        <span>
          Type: <span className="text-[#c7ccd9]">{selectedType}</span>
        </span>
      </div>

      {menu && (
        <div
          className="animate-pop-in fixed z-[60] w-56 overflow-hidden rounded-lg border border-[#2a3350] bg-[#1a2138] py-1 shadow-2xl shadow-black/60"
          style={{
            left: Math.min(menu.x, window.innerWidth - 230),
            top: Math.min(menu.y, window.innerHeight - 380),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuTargetLabel && (
            <MenuItem
              label={`Add ${menuTargetLabel}`}
              onClick={() => {
                setMenu(null);
                doMultiAdd(menu.path);
              }}
            />
          )}
          <MenuItem
            label="Add Child"
            onClick={() => {
              setMenu(null);
              doAddChild(menu.path);
            }}
          />
          <MenuItem label={menuEditLabel} onClick={() => { setMenu(null); openEdit(menu.path); }} />
          <MenuItem
            label="Rename"
            disabled={menu.path.length === 0}
            onClick={() => { setMenu(null); doRename(menu.path); }}
          />
          <MenuItem
            label="Duplicate"
            disabled={menu.path.length === 0}
            onClick={() => { setMenu(null); doDuplicate(menu.path); }}
          />
          <MenuItem label="Copy" onClick={() => { setMenu(null); doCopy(menu.path); }} />
          {clipboard && (
            <MenuItem
              label={`Paste ${clipboard.label}`}
              disabled={menu.path.length === 0 && menuType !== "object" && menuType !== "array"}
              onClick={() => { setMenu(null); doPaste(menu.path); }}
            />
          )}
          <MenuItem label="Delete Children" danger onClick={() => { setMenu(null); void doDeleteChildren(menu.path); }} />
          <MenuItem label="Delete" danger onClick={() => { setMenu(null); void doDelete(menu.path); }} />
        </div>
      )}

      {editDlg?.kind === "object" && editInitial !== null && typeof editInitial === "object" && !Array.isArray(editInitial) && (
        <ObjectEditor
          title={editDlg.title}
          schema={inferObjectSchema(editInitial)}
          initial={editInitial as Record<string, JsonValue>}
          coerceJson
          onDone={(r) => commitEdit(editDlg.path, r)}
          onCancel={() => setEditDlg(null)}
        />
      )}
      {editDlg?.kind === "leaf" && editInitial !== null && (
        <ObjectEditor
          title={editDlg.title}
          schema={{ value: { type: "leaf" } }}
          initial={{ value: editInitial as JsonValue }}
          coerceJson={false}
          onDone={(r) => commitEdit(editDlg.path, r.value ?? editInitial)}
          onCancel={() => setEditDlg(null)}
        />
      )}
      {editDlg?.kind === "array" && editInitial !== null && (
        <ArrayEditor
          title={editDlg.title}
          initial={editInitial as JsonValue[]}
          onDone={(v) => commitEdit(editDlg.path, v)}
          onCancel={() => setEditDlg(null)}
        />
      )}

      {addDlg?.kind === "child" && (
        <ValueEditor
          title="Add"
          initial={null}
          parseDefault
          onDone={commitAddChildValue}
          onCancel={() => setAddDlg(null)}
        />
      )}
      {addDlg?.kind === "multi" && (
        <MultiAdd
          title={addDlg.title}
          schema={multiSchema(data, addDlg.path)}
          isDictCollection={addDlg.isDict}
          onDone={commitMultiAdd}
          onCancel={() => setAddDlg(null)}
        />
      )}

      {renameDraft && (
        <PromptDialog
          title="Rename"
          label="New name"
          value={renameDraft.value}
          onOk={(v) => commitRename(v)}
          onCancel={() => setRenameDraft(null)}
        />
      )}

      {promptDraft && !renameDraft && (
        <PromptDialog
          title={promptDraft.title}
          label={promptDraft.label}
          value={promptDraft.value}
          onOk={(v) => {
            promptDraft.onOk(v);
            setPromptDraft(null);
          }}
          onCancel={() => setPromptDraft(null)}
        />
      )}
    </div>
  );
}

function multiSchema(data: JsonValue, path: KeyPath): Record<string, { type: "leaf" }> {
  try {
    const c = getAt(data, path);
    const kids: JsonValue[] =
      c !== null && typeof c === "object" && !Array.isArray(c)
        ? Object.values(c as Record<string, JsonValue>)
        : Array.isArray(c)
          ? [...c]
          : [];
    const keys = new Set<string>();
    for (const k of kids) {
      if (k !== null && typeof k === "object" && !Array.isArray(k)) {
        Object.keys(k).forEach((x) => keys.add(x));
      }
    }
    const s: Record<string, { type: "leaf" }> = {};
    for (const k of keys) s[k] = { type: "leaf" };
    return s;
  } catch {
    return {};
  }
}

function HeaderBtn({
  children,
  title,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-md p-1.5 ${
        primary
          ? "bg-[#2f6fed] text-white hover:bg-[#4a86ff]"
          : "text-[#c7ccd9] hover:bg-[#2f3545] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ToolBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs ${
        disabled
          ? "cursor-not-allowed text-[#4a5468]"
          : danger
            ? "text-[#ff7a7a] hover:bg-[#3a2030]"
            : "text-[#c7ccd9] hover:bg-[#222942] hover:text-white"
      }`}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`block w-full truncate px-3 py-1.5 text-left text-[13px] ${
        disabled
          ? "cursor-not-allowed text-[#4a5468]"
          : danger
            ? "text-[#ff7a7a] hover:bg-[#3a2030]"
            : "text-[#e5ecff] hover:bg-[#2f6fed] hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function PromptDialog({
  title,
  label,
  value,
  onOk,
  onCancel,
}: {
  title: string;
  label: string;
  value: string;
  onOk: (v: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="animate-fade-in fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4">
      <div className="animate-pop-in w-[380px] rounded-xl border border-[#2a3350] bg-[#141b30] p-5 shadow-2xl">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mb-1 mt-3 text-xs text-[#8b93a7]">{label}</p>
        <input
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOk(text);
            if (e.key === "Escape") onCancel();
          }}
          onFocus={(e) => e.target.select()}
          spellCheck={false}
          className="font-mono-app w-full rounded-lg border border-[#2a3350] bg-[#0b1020] px-3 py-1.5 text-sm outline-none focus:border-[#6a8dff]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-1.5 text-sm text-[#c7ccd9] hover:bg-[#222942]"
          >
            Cancel
          </button>
          <button
            onClick={() => onOk(text)}
            className="rounded-lg bg-[#2f6fed] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#4a86ff]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}


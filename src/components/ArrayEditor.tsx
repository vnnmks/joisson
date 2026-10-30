import { useRef, useState } from "react";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal, PrimaryButton, GhostButton } from "./Modal";
import { TYPE_COLORS } from "./JsonTree";
import { ObjectEditor, inferObjectSchema } from "./ObjectEditor";
import { ValueEditor } from "./ValueEditor";
import { moveArrayItem } from "../lib/jsonOps";
import { preview, typeName, type JsonValue } from "../lib/jsonModel";

export interface ArrayEditorProps {
  title: string;
  initial: JsonValue[];
  onDone: (value: JsonValue[]) => void;
  onCancel: () => void;
}

/** The "Edit <name>" dialog for arrays: the visual list in a modal. */
export function ArrayEditor(props: ArrayEditorProps) {
  return <ArrayForm {...props} variant="modal" />;
}

/**
 * Visual array editor: the array is shown as an ordered list. Rows can be
 * dragged to reorder, edited (objects and nested arrays open their own
 * editors, leaves open the raw JSON value editor) and removed.
 * "Edit as JSON" keeps the old raw-text path available.
 * Renders as a modal dialog (`variant="modal"`) or inline in the side panel
 * (`variant="inline"`).
 */
export function ArrayForm({
  title,
  initial,
  onDone,
  onCancel,
  variant,
}: ArrayEditorProps & { variant: "modal" | "inline" }) {
  const [items, setItems] = useState<JsonValue[]>(() => [...initial]);
  const [editing, setEditing] = useState<number | null>(null);
  // The drag source lives in a ref too, so a drop always sees the current row
  // even when React has not re-rendered since dragstart.
  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [asJson, setAsJson] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const commit = () => {
    if (!asJson) {
      onDone(items);
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setJsonError("Top level must be a JSON array.");
        return;
      }
      onDone(parsed as JsonValue[]);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const setItem = (idx: number, value: JsonValue) =>
    setItems((xs) => xs.map((v, i) => (i === idx ? value : v)));

  const drop = (target: number) => {
    const from = dragRef.current;
    dragRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
    if (from === null) return;
    setItems((xs) => moveArrayItem(xs, from, target));
  };

  const editValue = editing !== null ? items[editing] : undefined;
  const editType = editing !== null && editValue !== undefined ? typeName(editValue) : null;

  const body = asJson ? (
    <div>
      <p className="mb-2 text-xs text-[#8b93a7]">Array (JSON):</p>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        spellCheck={false}
        className="font-mono-app min-h-[320px] w-full rounded-lg border border-[#2a3350] bg-[#0b1020] p-3 text-[13px] leading-relaxed text-[#e5ecff] outline-none focus:border-[#6a8dff]"
      />
      {jsonError && <p className="mt-2 text-xs text-[#ff7a7a]">{jsonError}</p>}
    </div>
  ) : (
    <div className="flex flex-col">
      {items.length === 0 && (
        <p className="py-3 text-xs text-[#8b93a7]">Empty array — use “Add item” to append one.</p>
      )}
      {items.map((value, idx) => {
        const t = typeName(value);
        return (
          <div
            key={idx}
            draggable
            onDragStart={(e) => {
              dragRef.current = idx;
              setDragIndex(idx);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(idx));
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overIndex !== idx) setOverIndex(idx);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop(idx);
            }}
            onDragEnd={() => {
              dragRef.current = null;
              setDragIndex(null);
              setOverIndex(null);
            }}
            className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 ${
              overIndex === idx && dragIndex !== null && dragIndex !== idx
                ? "border-[#6a8dff] bg-[#1a2a4a]"
                : "border-transparent hover:bg-[#1a2240]"
            } ${dragIndex === idx ? "opacity-50" : ""}`}
            style={{ cursor: "grab" }}
            title="Drag to reorder"
          >
            <GripVertical size={14} className="shrink-0 text-[#4a5468] group-hover:text-[#8b93a7]" />
            <span className="w-8 shrink-0 text-[12px] text-[#8b93a7]">[{idx}]</span>
            <span
              className="shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium"
              style={{ color: TYPE_COLORS[t], backgroundColor: `${TYPE_COLORS[t]}1f` }}
            >
              {t}
            </span>
            <span className="font-mono-app min-w-0 flex-1 truncate text-[12.5px] text-[#c7ccd9]">
              {preview(value)}
            </span>
            <button
              onClick={() => setEditing(idx)}
              className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-[#c7ccd9] hover:bg-[#222942] hover:text-white"
              aria-label={`Edit item ${idx}`}
              title="Edit"
            >
              <Pencil size={13} /> Edit
            </button>
            <button
              onClick={() => setItems((xs) => xs.filter((_, i) => i !== idx))}
              className="shrink-0 rounded p-1 text-[#8b93a7] hover:bg-[#3a2030] hover:text-[#ff7a7a]"
              aria-label={`Delete item ${idx}`}
              title="Delete item"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (overIndex !== items.length) setOverIndex(items.length);
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop(items.length - 1);
        }}
        onDragEnd={() => {
          dragRef.current = null;
          setDragIndex(null);
          setOverIndex(null);
        }}
        className={`mt-1 flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs ${
          overIndex === items.length && dragIndex !== null
            ? "border-[#6a8dff] bg-[#1a2a4a] text-[#e5ecff]"
            : "border-[#232b47] text-[#8b93a7]"
        }`}
      >
        <button
          onClick={() => {
            setItems((xs) => [...xs, null]);
            setEditing(items.length);
          }}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:text-white"
        >
          <Plus size={13} /> Add item
        </button>
        <span className="ml-auto text-[11px]">Drag rows to reorder</span>
      </div>
    </div>
  );

  const footer = (
    <>
      <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-[#8b93a7]">
        <input
          type="checkbox"
          checked={asJson}
          onChange={(e) => {
            const on = e.target.checked;
            setJsonError(null);
            if (on) {
              // Raw mode starts from the current (possibly reordered) list.
              setJsonText(JSON.stringify(items, null, 2));
            } else {
              // Going back to the list keeps valid raw edits.
              try {
                const parsed = JSON.parse(jsonText);
                if (Array.isArray(parsed)) setItems(parsed as JsonValue[]);
              } catch {
                /* keep the current list */
              }
            }
            setAsJson(on);
          }}
          className="accent-[#2f6fed]"
        />
        Edit as JSON
      </label>
      <GhostButton onClick={onCancel}>Cancel</GhostButton>
      <PrimaryButton onClick={commit}>OK</PrimaryButton>
    </>
  );

  const nestedDialogs = (
    <>
      {editing !== null &&
        editValue !== undefined &&
        (editType === "object" ? (
          <ObjectEditor
            title={`Edit [${editing}]`}
            schema={inferObjectSchema(editValue)}
            initial={editValue as Record<string, JsonValue>}
            coerceJson
            onDone={(r) => {
              setItem(editing, r);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : editType === "array" ? (
          <ArrayEditor
            title={`Edit [${editing}]`}
            initial={editValue as JsonValue[]}
            onDone={(r) => {
              setItem(editing, r);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <ValueEditor
            title={`Edit [${editing}]`}
            initial={editValue}
            parseDefault
            onDone={(v) => {
              setItem(editing, v);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ))}
    </>
  );

  if (variant === "inline") {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">{body}</div>
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-[#232b47] pt-2">
            {footer}
          </div>
        </div>
        {nestedDialogs}
      </>
    );
  }

  return (
    <>
      <Modal title={title} wide onClose={onCancel} footer={footer}>
        {body}
      </Modal>
      {nestedDialogs}
    </>
  );
}

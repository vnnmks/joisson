import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, PrimaryButton, GhostButton, Field, inputCls } from "./Modal";
import { inferObjectSchema, type FormSchema } from "./ObjectEditor";
import { leafToText, parseJsonText } from "../lib/jsonOps";
import type { JsonValue } from "../lib/jsonModel";

export interface MultiItem {
  key: string;
  fields: Record<string, string>;
}

/**
 * Batch-add dialog for collections (Tk MultiAddDialog):
 * add N items at once; each gets a key plus leaf/dict fields.
 * In dict mode the schema is shared; in array-of-objects mode it is
 * inferred from the union of existing children (Tk infer_schema).
 */
export function MultiAdd({
  title,
  schema,
  isDictCollection,
  onDone,
  onCancel,
}: {
  title: string;
  schema: FormSchema;
  isDictCollection: boolean;
  onDone: (items: Array<[string, Record<string, JsonValue>]>) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<MultiItem[]>([{ key: "", fields: {} }]);

  const patch = (idx: number, p: Partial<MultiItem>) =>
    setItems((xs) => xs.map((it, i) => (i === idx ? { ...it, ...p } : it)));

  const setField = (idx: number, k: string, v: string) =>
    setItems((xs) => xs.map((it, i) => (i === idx ? { ...it, fields: { ...it.fields, [k]: v } } : it)));

  const commit = () => {
    const out: Array<[string, Record<string, JsonValue>]> = [];
    for (const it of items) {
      const dict: Record<string, JsonValue> = {};
      for (const [k, v] of Object.entries(it.fields)) {
        if (v.trim() === "") continue;
        try {
          dict[k] = parseJsonText(v);
        } catch {
          /* empty -> skipped */
        }
      }
      const key = isDictCollection ? it.key.trim() || `item${out.length + 1}` : String(out.length);
      out.push([key, dict]);
    }
    onDone(out);
  };

  const schemaKeys = useMemo(() => Object.keys(schema).sort(), [schema]);

  return (
    <Modal
      title={title}
      wide
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={() => setItems((xs) => [...xs, { key: "", fields: {} }])}
            className="mr-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[#c7ccd9] hover:bg-[#222942]"
          >
            <Plus size={14} /> Add item
          </button>
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton onClick={commit}>OK</PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-lg border border-[#232b47] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-[#8b93a7]">Item {idx + 1}</span>
              {items.length > 1 && (
                <button
                  onClick={() => setItems((xs) => xs.filter((_, i) => i !== idx))}
                  className="ml-auto rounded p-1 text-[#8b93a7] hover:bg-[#3a2030] hover:text-[#ff7a7a]"
                  aria-label="Remove item"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {isDictCollection && (
              <Field label="Key">
                <input
                  value={it.key}
                  onChange={(e) => patch(idx, { key: e.target.value })}
                  placeholder="item key"
                  spellCheck={false}
                  className={`${inputCls} font-mono-app`}
                />
              </Field>
            )}
            <div className="mt-2 flex flex-col gap-2">
              {schemaKeys.map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-[#c7ccd9]">{k}</span>
                  <input
                    value={it.fields[k] ?? ""}
                    onChange={(e) => setField(idx, k, e.target.value)}
                    spellCheck={false}
                    className={`${inputCls} font-mono-app`}
                  />
                </div>
              ))}
              {schemaKeys.length === 0 && (
                <p className="text-xs text-[#8b93a7]">
                  No known fields — items will be added with the key only. Use "Add Child" for
                  custom fields.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/** Schema shared by dict-collection children (leaf fields of each child). */
export function dictChildSchema(children: JsonValue[]): FormSchema {
  const keys = new Set<string>();
  for (const c of children) {
    if (c !== null && typeof c === "object" && !Array.isArray(c)) {
      Object.keys(c).forEach((k) => keys.add(k));
    }
  }
  const out: FormSchema = {};
  for (const k of keys) out[k] = { type: "leaf" };
  return out;
}

export function arrayChildLeafSchema(children: JsonValue[]): FormSchema {
  return dictChildSchema(children);
}

export { inferObjectSchema, leafToText };

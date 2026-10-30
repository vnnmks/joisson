import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Modal, PrimaryButton, GhostButton, Field, inputCls } from "./Modal";
import { ArrayEditor } from "./ArrayEditor";
import { leafToText, parseJsonText } from "../lib/jsonOps";
import type { JsonValue } from "../lib/jsonModel";

export interface FormSchema {
  [key: string]:
    | { type: "dict"; children: FormSchema }
    | { type: "array" }
    | { type: "leaf" };
}

/** Build a form schema from a live object (same shape as Tk infer_object_schema). */
export function inferObjectSchema(obj: unknown): FormSchema {
  const out: FormSchema = {};
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj as Record<string, JsonValue>)) {
    out[k] = Array.isArray(v)
      ? { type: "array" }
      : v !== null && typeof v === "object"
        ? { type: "dict", children: inferObjectSchema(v) }
        : { type: "leaf" };
  }
  return out;
}

/** Leaf entry text -> stored value. Mirrors Tk verbatim/coerced form behavior. */
export function parseLeafText(text: string, coerceJson: boolean): JsonValue | undefined {
  const v = text.trim();
  if (v === "") return undefined; // skipped, like the Tk version
  if (coerceJson) {
    try {
      return parseJsonText(v);
    } catch {
      return undefined;
    }
  }
  return v; // verbatim: "123" stays a string
}

interface FieldState {
  leafText: string;
  dictValue: JsonValue | undefined;
  dictEdited: boolean;
  arrayValue: JsonValue[] | undefined;
  arrayEdited: boolean;
}

export interface ObjectEditorProps {
  title: string;
  schema: FormSchema;
  initial: Record<string, JsonValue>;
  coerceJson?: boolean;
  onDone: (result: Record<string, JsonValue>) => void;
  onCancel: () => void;
}

/** The "Edit <name>" dialog: the form in a modal. */
export function ObjectEditor(props: ObjectEditorProps) {
  return <ObjectForm {...props} variant="modal" />;
}

/**
 * Form-style object editor.
 * Prefills from `initial`, supports nested objects and arrays via recursive
 * "Edit" dialogs, and an "Edit as JSON" raw mode. Renders as a modal dialog
 * (`variant="modal"`) or inline, e.g. in the side panel (`variant="inline"`).
 */
export function ObjectForm({
  title,
  schema,
  initial,
  coerceJson = true,
  onDone,
  onCancel,
  variant,
}: ObjectEditorProps & { variant: "modal" | "inline" }) {
  const allKeys = useMemo(() => {
    const keys = new Set<string>([...Object.keys(schema), ...Object.keys(initial)]);
    return [...keys].sort();
  }, [schema, initial]);

  const [state, setState] = useState<Record<string, FieldState>>(() => {
    const s: Record<string, FieldState> = {};
    for (const k of allKeys) {
      const v = initial[k];
      if (Array.isArray(v)) {
        s[k] = {
          leafText: "",
          dictValue: undefined,
          dictEdited: false,
          arrayValue: v,
          arrayEdited: true,
        };
      } else if (v !== null && typeof v === "object") {
        s[k] = {
          leafText: "",
          dictValue: v,
          dictEdited: true,
          arrayValue: undefined,
          arrayEdited: false,
        };
      } else if (v !== undefined) {
        s[k] = {
          leafText: leafToText(v),
          dictValue: undefined,
          dictEdited: false,
          arrayValue: undefined,
          arrayEdited: false,
        };
      } else {
        s[k] = {
          leafText: "",
          dictValue: undefined,
          dictEdited: false,
          arrayValue: undefined,
          arrayEdited: false,
        };
      }
    }
    return s;
  });
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");
  const [showAddKey, setShowAddKey] = useState(false);
  const [nestedKey, setNestedKey] = useState<string | null>(null);
  const [nestedArrayKey, setNestedArrayKey] = useState<string | null>(null);
  const [asJson, setAsJson] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial ?? {}, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const visibleKeys = useMemo(
    () => [...allKeys, ...extraKeys.filter((k) => !allKeys.includes(k))].sort(),
    [allKeys, extraKeys],
  );

  const patch = (k: string, p: Partial<FieldState>) =>
    setState((s) => ({ ...s, [k]: { ...s[k], ...p } }));

  const isDictKey = (k: string) => {
    const sch = schema[k];
    if (sch?.type === "dict") return true;
    const v0 = initial[k];
    return v0 !== null && typeof v0 === "object" && !Array.isArray(v0);
  };

  const isArrayKey = (k: string) => {
    const sch = schema[k];
    if (sch?.type === "array") return true;
    return Array.isArray(initial[k]);
  };

  const commit = () => {
    if (asJson) {
      try {
        const parsed = JSON.parse(jsonText);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          setJsonError("Top level must be a JSON object.");
          return;
        }
        onDone(parsed as Record<string, JsonValue>);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      }
      return;
    }
    const result: Record<string, JsonValue> = {};
    for (const k of visibleKeys) {
      const f = state[k];
      if (!f) continue;
      if (isDictKey(k)) {
        if (f.dictEdited && f.dictValue !== undefined) result[k] = f.dictValue;
        else if (k in initial) result[k] = initial[k];
      } else if (isArrayKey(k)) {
        if (f.arrayEdited && f.arrayValue !== undefined) result[k] = f.arrayValue;
        else if (k in initial) result[k] = initial[k];
      } else {
        const parsed = parseLeafText(f.leafText, coerceJson);
        if (parsed !== undefined) result[k] = parsed;
      }
    }
    onDone(result);
  };

  const nested = nestedKey
    ? {
        key: nestedKey,
        schema:
          schema[nestedKey]?.type === "dict"
            ? schema[nestedKey].children
            : inferObjectSchema(state[nestedKey]?.dictValue ?? initial[nestedKey] ?? {}),
        initial: (state[nestedKey]?.dictValue ?? initial[nestedKey] ?? {}) as Record<
          string,
          JsonValue
        >,
      }
    : null;

  const body = asJson ? (
    <div>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        spellCheck={false}
        className="font-mono-app min-h-[320px] w-full rounded-lg border border-[#2a3350] bg-[#0b1020] p-3 text-[13px] leading-relaxed text-[#e5ecff] outline-none focus:border-[#6a8dff]"
      />
      {jsonError && <p className="mt-2 text-xs text-[#ff7a7a]">{jsonError}</p>}
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      {visibleKeys.map((k) =>
        isDictKey(k) ? (
          <div key={k} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-sm text-[#c7ccd9]">{k}</span>
            <button
              onClick={() => setNestedKey(k)}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a3350] px-3 py-1.5 text-sm text-[#c7ccd9] hover:border-[#6a8dff] hover:text-white"
            >
              <Pencil size={13} />
              {state[k]?.dictEdited ? "Edit (set)" : "Edit"}
            </button>
          </div>
        ) : isArrayKey(k) ? (
          <div key={k} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-sm text-[#c7ccd9]">{k}</span>
            <button
              onClick={() => setNestedArrayKey(k)}
              className="flex items-center gap-1.5 rounded-lg border border-[#2a3350] px-3 py-1.5 text-sm text-[#c7ccd9] hover:border-[#6a8dff] hover:text-white"
            >
              <Pencil size={13} />
              {state[k]?.arrayEdited ? "Edit (set)" : "Edit"}
            </button>
          </div>
        ) : (
          <div key={k} className="flex items-center gap-3">
            <span className="w-40 shrink-0 truncate text-sm text-[#c7ccd9]">{k}</span>
            <Field label="">
              <input
                value={state[k]?.leafText ?? ""}
                onChange={(e) => patch(k, { leafText: e.target.value })}
                spellCheck={false}
                className={`${inputCls} font-mono-app`}
              />
            </Field>
          </div>
        ),
      )}
    </div>
  );

  const footer = (
    <>
      <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-[#8b93a7]">
        <input
          type="checkbox"
          checked={asJson}
          onChange={(e) => {
            setAsJson(e.target.checked);
            setJsonError(null);
          }}
          className="accent-[#2f6fed]"
        />
        Edit as JSON
      </label>
      {!showAddKey ? (
        <button
          onClick={() => setShowAddKey(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-[#c7ccd9] hover:bg-[#222942]"
        >
          + Add field
        </button>
      ) : (
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newKey.trim()) {
              const k = newKey.trim();
              if (!visibleKeys.includes(k)) {
                setExtraKeys((x) => [...x, k]);
                patch(k, { leafText: "" });
              }
              setNewKey("");
              setShowAddKey(false);
            }
            if (e.key === "Escape") {
              setShowAddKey(false);
              setNewKey("");
            }
          }}
          placeholder="field name"
          autoFocus
          className={`${inputCls} !w-40 !py-1`}
        />
      )}
      <GhostButton onClick={onCancel}>Cancel</GhostButton>
      <PrimaryButton onClick={commit}>OK</PrimaryButton>
    </>
  );

  const nestedDialogs = (
    <>
      {nested && (
        <ObjectEditor
          title={`Edit ${nested.key}`}
          schema={nested.schema}
          initial={nested.initial}
          coerceJson={coerceJson}
          onDone={(r) => {
            patch(nested.key, { dictValue: r, dictEdited: true });
            setNestedKey(null);
          }}
          onCancel={() => setNestedKey(null)}
        />
      )}
      {nestedArrayKey && (
        <ArrayEditor
          title={`Edit ${nestedArrayKey}`}
          initial={
            (state[nestedArrayKey]?.arrayValue ?? initial[nestedArrayKey] ?? []) as JsonValue[]
          }
          onDone={(r) => {
            patch(nestedArrayKey, { arrayValue: r, arrayEdited: true });
            setNestedArrayKey(null);
          }}
          onCancel={() => setNestedArrayKey(null)}
        />
      )}
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

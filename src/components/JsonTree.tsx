import { memo, useRef, useState, type RefObject } from "react";
import { ChevronRight, ChevronDown, Braces, Brackets, type LucideIcon } from "lucide-react";
import { pathKey, preview, typeName, type JsonType, type JsonValue, type KeyPath } from "../lib/jsonModel";
import { canDropNode, type DropPosition } from "../lib/jsonOps";

export const TYPE_COLORS: Record<JsonType, string> = {
  object: "#7aa2f7",
  array: "#bb9af7",
  string: "#9ece6a",
  number: "#e0af68",
  boolean: "#ff9e64",
  null: "#6b7280",
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  object: Braces,
  array: Brackets,
};

const ROW_H = 28;

export interface TreeMenuRequest {
  path: KeyPath;
  x: number;
  y: number;
}

interface SharedProps {
  expanded: Set<string>;
  selected: KeyPath | null;
  onToggle: (path: KeyPath) => void;
  onSelect: (path: KeyPath) => void;
  onEdit: (path: KeyPath) => void;
  onRename: (path: KeyPath) => void;
  onMenu: (req: TreeMenuRequest) => void;
  onMove: (from: KeyPath, target: KeyPath, position: DropPosition) => void;
}

interface RowProps extends SharedProps {
  path: KeyPath;
  name: string;
  value: JsonValue;
  depth: number;
  dragRef: RefObject<KeyPath | null>;
}

const Row = memo(function Row(props: RowProps) {
  const { path, name, value, depth, expanded, selected } = props;
  const type = typeName(value);
  const key = pathKey(path);
  const isOpen = expanded.has(key);
  const isSelected = selected !== null && pathKey(selected) === key;
  const isContainer = type === "object" || type === "array";
  const Icon = TYPE_ICONS[type];
  const clickTimer = useRef<number | null>(null);
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);

  const children: Array<[string | number, JsonValue]> = isContainer
    ? Array.isArray(value)
      ? value.map((v, i) => [i, v] as [number, JsonValue])
      : Object.entries(value as Record<string, JsonValue>)
    : [];

  const handleDoubleClick = (e: React.MouseEvent) => {
    // Mirror the Tk rule: only a double-click directly on the *name text*
    // opens the editor. The expander chevron toggles on single click, and
    // double-clicks on the type chip or value preview do nothing.
    const target = e.target as HTMLElement;
    if (target.closest("[data-expander]")) return;
    if (!target.closest("[data-name]")) return;
    e.stopPropagation();
    props.onEdit(path);
  };

  /** Where a drop would land on this row (null when it is not allowed). */
  const resolveDropPosition = (e: React.DragEvent<HTMLDivElement>): DropPosition | null => {
    const from = props.dragRef.current;
    if (!from) return null;
    let pos: DropPosition;
    if (path.length === 0) {
      if (!isContainer) return null;
      pos = "inside";
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
      if (isContainer) {
        // An open container has its children right below, so "after" only applies when collapsed.
        if (ratio < 0.25) pos = "before";
        else if (ratio > 0.75 && !isOpen) pos = "after";
        else pos = "inside";
      } else {
        pos = ratio < 0.5 ? "before" : "after";
      }
    }
    return canDropNode(from, path, pos) ? pos : null;
  };

  const rowBg =
    dropPos === "inside"
      ? "bg-[#2f6fed]/30 ring-1 ring-inset ring-[#6a8dff]"
      : isSelected
        ? "bg-[#1f4a86]/70"
        : "hover:bg-[#1a2240]";

  return (
    <>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={isContainer ? isOpen : undefined}
        draggable={path.length > 0}
        onClick={() => props.onSelect(path)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onSelect(path);
          props.onMenu({ path, x: e.clientX, y: e.clientY });
        }}
        onDragStart={(e) => {
          if (path.length === 0) {
            e.preventDefault();
            return;
          }
          props.dragRef.current = path;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("application/x-joisson-node", key);
        }}
        onDragEnd={() => {
          props.dragRef.current = null;
          setDropPos(null);
        }}
        onDragOver={(e) => {
          const pos = resolveDropPosition(e);
          if (!pos) {
            if (dropPos !== null) setDropPos(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (pos !== dropPos) setDropPos(pos);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropPos(null);
        }}
        onDrop={(e) => {
          const pos = resolveDropPosition(e);
          const from = props.dragRef.current;
          setDropPos(null);
          props.dragRef.current = null;
          if (!pos || !from) return;
          e.preventDefault();
          props.onMove(from, path, pos);
        }}
        className={`relative flex cursor-default items-center gap-1.5 rounded-md pr-2 select-none ${rowBg}`}
        style={{ height: ROW_H, paddingLeft: 8 + depth * 18 }}
        title={name}
      >
        {Array.from({ length: depth }).map((_, i) => (
          <span key={i} className="tree-guide" style={{ left: 8 + i * 18 + 6 }} aria-hidden />
        ))}
        {dropPos === "before" && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded bg-[#6a8dff]" />
        )}
        {dropPos === "after" && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded bg-[#6a8dff]" />
        )}
        {isContainer ? (
          <button
            data-expander
            aria-label={isOpen ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              if (clickTimer.current) window.clearTimeout(clickTimer.current);
              props.onToggle(path);
            }}
            className="shrink-0 rounded p-0.5 text-[#8b93a7] hover:bg-[#2f3545] hover:text-white"
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}
        {Icon && <Icon size={14} style={{ color: TYPE_COLORS[type] }} className="shrink-0" />}
        <span data-name className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="truncate text-[13px]"
            style={{ color: path.length === 0 ? "#e5ecff" : "#c7ccd9", fontWeight: path.length === 0 ? 600 : 400 }}
          >
            {name}
          </span>
          <span
            className="shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium"
            style={{ color: TYPE_COLORS[type], backgroundColor: `${TYPE_COLORS[type]}1f` }}
          >
            {type}
          </span>
          <span className="font-mono-app truncate text-[12px] text-[#8b93a7]">
            {preview(value)}
          </span>
        </span>
      </div>
      {isContainer &&
        isOpen &&
        children.map(([k, v]) => (
          <Row
            key={String(k)}
            path={[...path, k]}
            name={Array.isArray(value) ? `[${k}]` : String(k)}
            value={v}
            depth={depth + 1}
            expanded={expanded}
            selected={selected}
            onToggle={props.onToggle}
            onSelect={props.onSelect}
            onEdit={props.onEdit}
            onRename={props.onRename}
            onMenu={props.onMenu}
            onMove={props.onMove}
            dragRef={props.dragRef}
          />
        ))}
    </>
  );
});

export function JsonTree(props: SharedProps & { data: JsonValue }) {
  // The node being dragged; a ref so drag progress never re-renders the tree.
  const dragRef = useRef<KeyPath | null>(null);
  return (
    <div role="tree" aria-label="JSON document" className="py-1">
      <Row
        path={[]}
        name="root (JSON)"
        value={props.data}
        depth={0}
        expanded={props.expanded}
        selected={props.selected}
        onToggle={props.onToggle}
        onSelect={props.onSelect}
        onEdit={props.onEdit}
        onRename={props.onRename}
        onMenu={props.onMenu}
        onMove={props.onMove}
        dragRef={dragRef}
      />
    </div>
  );
}

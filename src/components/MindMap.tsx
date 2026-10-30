import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, Maximize2, Minus, Plus } from "lucide-react";
import { pathKey, preview, type JsonValue, type KeyPath } from "../lib/jsonModel";
import {
  buildMindTree,
  layoutMindTree,
  MIND_LAYOUTS,
  type MindLayoutId,
} from "../lib/mindLayout";
import { TYPE_COLORS, type TreeMenuRequest } from "./JsonTree";
import { MindLayoutPicker } from "./MindLayoutPicker";

/* Minimalist, interactive mind map of the JSON document.
 * Layouts are computed in document space by lib/mindLayout; the canvas is
 * panned/zoomed by a single transform so links (SVG) and nodes (HTML) stay in
 * sync.
 */

const FIT_PAD = 36;
const MIN_K = 0.2;
const MAX_K = 2.4;

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

interface View {
  x: number;
  y: number;
  k: number;
}

export interface MindMapProps {
  data: JsonValue;
  expanded: Set<string>;
  selected: KeyPath | null;
  layout: MindLayoutId;
  onLayoutChange: (layout: MindLayoutId) => void;
  onToggle: (path: KeyPath) => void;
  onSelect: (path: KeyPath) => void;
  onEdit: (path: KeyPath) => void;
  onMenu: (req: TreeMenuRequest) => void;
}

function labelFor(path: KeyPath): string {
  let out = "root";
  for (const seg of path) out += typeof seg === "number" ? `[${seg}]` : `.${seg}`;
  return out;
}

export function MindMap({
  data,
  expanded,
  selected,
  layout,
  onLayoutChange,
  onToggle,
  onSelect,
  onEdit,
  onMenu,
}: MindMapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const didFit = useRef(false);
  const anchor = useRef<{ key: string; sx: number; sy: number } | null>(null);

  const model = useMemo(
    () => layoutMindTree(buildMindTree(data, expanded), layout),
    [data, expanded, layout],
  );
  const prevOpenCount = useRef(expanded.size);
  const prevLayout = useRef(layout);

  const anchorTo = (key: string) => {
    const p = model.pos.get(key);
    if (!p) return;
    anchor.current = { key, sx: p.x * view.k + view.x, sy: p.y * view.k + view.y };
  };

  // Ancestor chain (including self) of the selection, for path highlighting.
  const chain = useMemo(() => {
    const set = new Set<string>();
    if (selected) {
      for (let i = 0; i <= selected.length; i++) set.add(pathKey(selected.slice(0, i)));
    }
    return set;
  }, [selected]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const { bounds } = model;
    const k = clampK(
      Math.min(
        (size.w - FIT_PAD * 2) / Math.max(1, bounds.w),
        (size.h - FIT_PAD * 2) / Math.max(1, bounds.h),
        1.15,
      ),
    );
    setView({
      k,
      x: (size.w - bounds.w * k) / 2 - bounds.x * k,
      y: (size.h - bounds.h * k) / 2 - bounds.y * k,
    });
  }, [size, model]);

  // Fit once, as soon as the canvas has a real size.
  useEffect(() => {
    if (didFit.current || !size.w || !size.h) return;
    didFit.current = true;
    fit();
  }, [size, fit]);

  // A different layout re-frames the map. Expanding/collapsing moves the whole
  // layout too, so compensate the pan to keep the node the user acted on still;
  // a bulk change (Expand/Collapse All) has no such node and refits instead.
  useLayoutEffect(() => {
    const layoutChanged = prevLayout.current !== layout;
    prevLayout.current = layout;
    const a = anchor.current;
    anchor.current = null;
    const prevCount = prevOpenCount.current;
    prevOpenCount.current = expanded.size;
    if (layoutChanged) {
      if (didFit.current) fit();
      return;
    }
    if (a) {
      const p = model.pos.get(a.key);
      if (!p) return;
      setView((v) => ({ ...v, x: a.sx - p.x * v.k, y: a.sy - p.y * v.k }));
      return;
    }
    if (Math.abs(expanded.size - prevCount) > 1) fit();
  }, [model, expanded.size, fit, layout]);

  // Close the layout picker on outside click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("[data-layout-picker]")) return;
      setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  const zoomAt = useCallback((px: number, py: number, factor: number) => {
    setView((v) => {
      const k = clampK(v.k * factor);
      if (k === v.k) return v;
      const r = k / v.k;
      return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r };
    });
  }, []);

  const zoomBy = useCallback(
    (factor: number) => zoomAt(size.w / 2, size.h / 2, factor),
    [size, zoomAt],
  );

  // Wheel must be a non-passive listener so it can be swallowed.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0025));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const layoutLabel = MIND_LAYOUTS.find((l) => l.id === layout)?.label ?? "Flow";
  const { bounds } = model;
  const svgPad = 48;

  return (
    <div
      ref={wrapRef}
      className={`animate-fade-in relative h-full w-full touch-none overflow-hidden select-none ${
        panning ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(86,112,178,0.20) 1px, transparent 1px)",
        backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("[data-node]") || target.closest("[data-canvas]")) return;
        drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        e.currentTarget.setPointerCapture(e.pointerId);
        setPanning(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-node]")) return;
        fit();
      }}
    >
      <div
        role="tree"
        aria-label="JSON mind map"
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          className="absolute"
          aria-hidden
          style={{
            left: bounds.x - svgPad,
            top: bounds.y - svgPad,
            width: bounds.w + svgPad * 2,
            height: bounds.h + svgPad * 2,
            pointerEvents: "none",
          }}
          viewBox={`${bounds.x - svgPad} ${bounds.y - svgPad} ${bounds.w + svgPad * 2} ${
            bounds.h + svgPad * 2
          }`}
        >
          {model.edges.map((edge) => {
            const active = chain.has(edge.to);
            return (
              <path
                key={edge.key}
                d={edge.d}
                fill="none"
                stroke={active ? "#4a86ff" : "#26304d"}
                strokeWidth={active ? 1.8 : 1.4}
                strokeLinecap="round"
                opacity={active ? 0.95 : 1}
              />
            );
          })}
        </svg>

        {model.order.map((n) => {
          const p = model.pos.get(n.key) ?? { x: 0, y: 0 };
          const isSelected = selected !== null && pathKey(selected) === n.key;
          const inChain = chain.has(n.key);
          const isRoot = n.depth === 0;
          const isContainer = n.type === "object" || n.type === "array";
          const accent = TYPE_COLORS[n.type];
          return (
            <div
              key={n.key}
              data-node
              role="treeitem"
              aria-selected={isSelected}
              aria-label={`${n.name} (${n.type})`}
              title={labelFor(n.path)}
              onClick={() => {
                onSelect(n.path);
                if (n.childCount > 0 && !n.open) {
                  anchorTo(n.key);
                  onToggle(n.path);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onEdit(n.path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(n.path);
                onMenu({ path: n.path, x: e.clientX, y: e.clientY });
              }}
              className={`absolute flex cursor-pointer items-center gap-2 rounded-[10px] border px-2.5 transition-[background-color,border-color,box-shadow] duration-150 ${
                isSelected
                  ? "border-[#4a86ff] bg-[#1c2d52] shadow-[0_0_0_3px_rgba(74,134,255,0.15),0_10px_24px_-14px_rgba(0,0,0,0.9)]"
                  : inChain
                    ? "border-[#2f4570] bg-[#141e37] hover:bg-[#182441]"
                    : "border-[#222c48] bg-[#101829] hover:border-[#33456f] hover:bg-[#151f37]"
              } ${isRoot ? "bg-gradient-to-r from-[#18244a] to-[#111a30]" : ""}`}
              style={{ left: p.x, top: p.y, width: n.w, height: n.h }}
            >
              <span
                className="shrink-0 rounded-full"
                style={{
                  width: isRoot ? 7 : 6,
                  height: isRoot ? 7 : 6,
                  backgroundColor: accent,
                }}
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  isRoot
                    ? "text-[13px] font-semibold text-[#eaf0ff]"
                    : "text-[12.5px] font-medium text-[#d3dbec]"
                }`}
              >
                {n.name}
              </span>
              {!isContainer && (
                <span className="font-mono-app max-w-[55%] min-w-0 truncate text-[10.5px] text-[#7e89a4]">
                  {preview(n.value)}
                </span>
              )}
              {isContainer &&
                n.childCount > 0 &&
                (n.open ? (
                  <button
                    data-caret
                    aria-label="Collapse"
                    title="Collapse"
                    onClick={(e) => {
                      e.stopPropagation();
                      anchorTo(n.key);
                      onToggle(n.path);
                    }}
                    className="ml-auto flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border border-[#2c3a5c] text-[#7e89a4] hover:border-[#4a86ff] hover:text-white"
                  >
                    <Minus size={9} />
                  </button>
                ) : (
                  <span
                    className="ml-auto flex h-[15px] min-w-[15px] shrink-0 items-center justify-center rounded-full px-1 text-[9.5px] font-semibold"
                    style={{ color: accent, backgroundColor: `${accent}26` }}
                  >
                    {n.childCount}
                  </span>
                ))}
            </div>
          );
        })}
      </div>

      <div
        data-canvas
        className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-[#232b47] bg-[#10162b]/95 p-0.5 shadow-lg shadow-black/40"
      >
        <CanvasBtn label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
          <Minus size={13} />
        </CanvasBtn>
        <span className="font-mono-app w-10 text-center text-[10.5px] text-[#8b93a7]">
          {Math.round(view.k * 100)}%
        </span>
        <CanvasBtn label="Zoom in" onClick={() => zoomBy(1.25)}>
          <Plus size={13} />
        </CanvasBtn>
        <span className="mx-0.5 h-4 w-px bg-[#232b47]" />
        <CanvasBtn label="Fit to view" onClick={fit}>
          <Maximize2 size={12} />
        </CanvasBtn>
        <span className="mx-0.5 h-4 w-px bg-[#232b47]" />
        <div data-layout-picker className="relative">
          <button
            onClick={() => setPickerOpen((open) => !open)}
            title="Mind map layout"
            aria-haspopup="true"
            aria-expanded={pickerOpen}
            className={`flex items-center gap-1 rounded px-1.5 py-1 text-[10.5px] ${
              pickerOpen
                ? "bg-[#222942] text-white"
                : "text-[#8b93a7] hover:bg-[#222942] hover:text-white"
            }`}
          >
            <LayoutGrid size={12} />
            {layoutLabel}
            <ChevronDown size={10} />
          </button>
          {pickerOpen && (
            <MindLayoutPicker
              layout={layout}
              onPick={(id) => {
                onLayoutChange(id);
                setPickerOpen(false);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CanvasBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1 text-[#8b93a7] hover:bg-[#222942] hover:text-white"
    >
      {children}
    </button>
  );
}

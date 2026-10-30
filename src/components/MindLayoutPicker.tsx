import { Check } from "lucide-react";
import { MIND_LAYOUTS, type MindLayoutId } from "../lib/mindLayout";

const LINE = "#3b4a72";
const LINE_ACTIVE = "#4a86ff";

/** Tiny diagram of a layout, drawn with a handful of nodes and links. */
function Thumb({ id, active }: { id: MindLayoutId; active: boolean }) {
  const line = active ? LINE_ACTIVE : LINE;
  const cls = active
    ? "fill-[#27406e] stroke-[#4a86ff]"
    : "fill-[#1a2340] stroke-[#33415f]";
  const node = (x: number, y: number, w: number, h: number) => (
    <rect key={`${x}-${y}-${w}`} x={x} y={y} width={w} height={h} rx={2.5} className={cls} strokeWidth={1} />
  );
  const link = (d: string, key: string) => (
    <path key={key} d={d} fill="none" stroke={line} strokeWidth={1} strokeLinecap="round" />
  );

  let content: React.ReactNode;
  switch (id) {
    case "reverse":
      content = (
        <>
          {link("M 36 17 C 28 17, 24 6, 16 6", "a")}
          {link("M 36 17 C 28 17, 24 17, 16 17", "b")}
          {link("M 36 17 C 28 17, 24 28, 16 28", "c")}
          {node(36, 13, 10, 8)}
          {node(2, 3, 14, 6)}
          {node(2, 14, 14, 6)}
          {node(2, 25, 14, 6)}
        </>
      );
      break;
    case "split":
      content = (
        <>
          {link("M 29 17 C 32 17, 32 7, 34 7", "a")}
          {link("M 29 17 C 32 17, 32 17, 34 17", "b")}
          {link("M 29 17 C 32 17, 32 27, 34 27", "c")}
          {link("M 19 17 C 16 17, 16 7, 14 7", "d")}
          {link("M 19 17 C 16 17, 16 27, 14 27", "e")}
          {node(19, 13, 10, 8)}
          {node(34, 4, 12, 6)}
          {node(34, 14, 12, 6)}
          {node(34, 24, 12, 6)}
          {node(2, 4, 12, 6)}
          {node(2, 24, 12, 6)}
        </>
      );
      break;
    case "outline":
      content = (
        <>
          {link("M 24 10 C 24 18, 8 15, 8 24", "a")}
          {link("M 24 10 C 24 18, 24 15, 24 24", "b")}
          {link("M 24 10 C 24 18, 40 15, 40 24", "c")}
          {node(17, 2, 14, 8)}
          {node(2, 24, 12, 7)}
          {node(18, 24, 12, 7)}
          {node(34, 24, 12, 7)}
        </>
      );
      break;
    case "levels":
      content = (
        <>
          {link("M 12 17 C 16 17, 16 8, 20 8", "a")}
          {link("M 12 17 C 16 17, 16 24, 20 24", "b")}
          {link("M 30 8 C 34 8, 34 5, 38 5", "c")}
          {link("M 30 8 C 34 8, 34 16, 38 16", "d")}
          {link("M 30 24 C 34 24, 34 23, 38 23", "e")}
          {link("M 30 24 C 34 24, 34 30, 38 30", "f")}
          {node(2, 13, 10, 8)}
          {node(20, 5, 10, 6)}
          {node(20, 21, 10, 6)}
          {node(38, 2, 8, 6)}
          {node(38, 13, 8, 6)}
          {node(38, 20, 8, 6)}
          {node(38, 27, 8, 6)}
        </>
      );
      break;
    default:
      content = (
        <>
          {link("M 12 17 C 20 17, 24 6, 32 6", "a")}
          {link("M 12 17 C 20 17, 24 17, 32 17", "b")}
          {link("M 12 17 C 20 17, 24 28, 32 28", "c")}
          {node(2, 13, 10, 8)}
          {node(32, 3, 14, 6)}
          {node(32, 14, 14, 6)}
          {node(32, 25, 14, 6)}
        </>
      );
  }

  return (
    <span
      className={`flex h-[34px] w-[48px] shrink-0 items-center justify-center rounded-md border ${
        active ? "border-[#2f4c85] bg-[#101a30]" : "border-[#232c47] bg-[#0b1020]"
      }`}
    >
      <svg viewBox="0 0 48 34" className="h-full w-full" aria-hidden>
        {content}
      </svg>
    </span>
  );
}

export function MindLayoutPicker({
  layout,
  onPick,
}: {
  layout: MindLayoutId;
  onPick: (id: MindLayoutId) => void;
}) {
  return (
    <div className="animate-pop-in absolute bottom-full right-0 mb-2 w-[228px] rounded-xl border border-[#2a3350] bg-[#141b30] p-1.5 shadow-2xl shadow-black/60">
      <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold tracking-wide text-[#6b7691] uppercase">
        Layout
      </p>
      {MIND_LAYOUTS.map((def) => {
        const active = def.id === layout;
        return (
          <button
            key={def.id}
            onClick={() => onPick(def.id)}
            aria-pressed={active}
            className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left ${
              active ? "bg-[#1d2a49]" : "hover:bg-[#1b2338]"
            }`}
          >
            <Thumb id={def.id} active={active} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-[#e5ecff]">{def.label}</span>
              <span className="block truncate text-[10.5px] text-[#7e89a4]">{def.hint}</span>
            </span>
            {active && <Check size={13} className="shrink-0 text-[#4a86ff]" />}
          </button>
        );
      })}
    </div>
  );
}

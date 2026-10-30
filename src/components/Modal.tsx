import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Centered modal dialog. Closes on overlay click (unless persistent) and Escape. */
export function Modal({
  title,
  icon,
  children,
  footer,
  onClose,
  wide,
  persistent,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  persistent?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !persistent) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, persistent]);

  useEffect(() => {
    // Focus the first field, selecting its text like the Tk version does.
    const box = boxRef.current;
    if (!box) return;
    const el = box.querySelector<HTMLElement>("input, textarea");
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      requestAnimationFrame(() => {
        try {
          el.select();
        } catch {
          /* noop */
        }
      });
    }
  }, []);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !persistent) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        className={`animate-pop-in flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-[#2a3350] bg-[#141b30] shadow-2xl shadow-black/60 ${
          wide ? "w-[720px]" : "w-[520px]"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[#232b47] px-4 py-3">
          {icon}
          <h2 className="text-sm font-semibold text-[#e5ecff]">{title}</h2>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-[#8b93a7] hover:bg-[#2f3545] hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[#232b47] px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-[#2f6fed] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#4a86ff] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
        danger
          ? "text-[#ff7a7a] hover:bg-[#3a2030]"
          : "text-[#c7ccd9] hover:bg-[#222942]"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#8b93a7]">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-[#2a3350] bg-[#0b1020] px-3 py-1.5 text-sm text-[#e5ecff] placeholder-[#4a5468] outline-none focus:border-[#6a8dff]";

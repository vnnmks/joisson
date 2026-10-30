import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (message: string) => Promise<boolean>;
} | null>(null);

export function useToasts() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToasts must be used inside ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  const idRef = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = idRef.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => setConfirmState({ message, resolve }));
  }, []);

  const answer = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      {children}
      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-toast-in pointer-events-auto flex items-center gap-2 rounded-lg border border-[#2a3350] bg-[#1a2138] px-4 py-2 text-sm text-[#e5ecff] shadow-xl shadow-black/50"
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={16} className="text-[#9ece6a]" />
            ) : t.kind === "error" ? (
              <AlertCircle size={16} className="text-[#ff7a7a]" />
            ) : (
              <Info size={16} className="text-[#6a8dff]" />
            )}
            {t.message}
          </div>
        ))}
      </div>
      {/* Confirm dialog (replaces Tk messagebox.askyesno) */}
      {confirmState && (
        <div className="animate-fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="animate-pop-in w-[380px] rounded-xl border border-[#2a3350] bg-[#141b30] p-5 shadow-2xl">
            <p className="text-sm text-[#e5ecff]">{confirmState.message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => answer(false)}
                className="rounded-lg px-4 py-1.5 text-sm text-[#c7ccd9] hover:bg-[#222942]"
              >
                No
              </button>
              <button
                onClick={() => answer(true)}
                className="rounded-lg bg-[#2f6fed] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#4a86ff]"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

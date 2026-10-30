import { useState } from "react";
import { Modal, PrimaryButton, GhostButton } from "./Modal";
import type { JsonValue } from "../lib/jsonModel";

/**
 * Raw JSON value editor (used for arrays, like Tk's ask_value/ValueDialog).
 * With "Parse as JSON" on (default for non-strings), the text is json.loads'd.
 * With it off, the raw text is stored verbatim — strings show without quotes.
 */
export function ValueEditor({
  title,
  initial,
  parseDefault,
  onDone,
  onCancel,
}: {
  title: string;
  initial: JsonValue;
  parseDefault: boolean;
  onDone: (value: JsonValue) => void;
  onCancel: () => void;
}) {
  const [parse, setParse] = useState(parseDefault);
  const [text, setText] = useState(() =>
    parseDefault ? JSON.stringify(initial, null, 2) : typeof initial === "string" ? initial : JSON.stringify(initial),
  );
  const [error, setError] = useState<string | null>(null);

  const flip = (next: boolean) => {
    if (next === parse) return;
    if (next) {
      // Turning parse ON: wrap the raw text as a JSON string literal.
      setText(JSON.stringify(text));
    } else {
      // Turning parse OFF: unquote a JSON string if it parses to one.
      try {
        const v = JSON.parse(text);
        setText(typeof v === "string" ? v : text);
      } catch {
        /* keep raw text */
      }
    }
    setParse(next);
    setError(null);
  };

  const commit = () => {
    if (parse) {
      try {
        onDone(JSON.parse(text) as JsonValue);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Invalid JSON");
      }
    } else {
      onDone(text);
    }
  };

  return (
    <Modal
      title={title}
      wide
      onClose={onCancel}
      footer={
        <>
          <label className="mr-auto flex cursor-pointer items-center gap-2 text-xs text-[#8b93a7]">
            <input
              type="checkbox"
              checked={parse}
              onChange={(e) => flip(e.target.checked)}
              className="accent-[#2f6fed]"
            />
            Parse as JSON (uncheck to store as plain text)
          </label>
          <GhostButton onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton onClick={commit}>OK</PrimaryButton>
        </>
      }
    >
      <p className="mb-2 text-xs text-[#8b93a7]">Value (JSON):</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="font-mono-app min-h-[280px] w-full rounded-lg border border-[#2a3350] bg-[#0b1020] p-3 text-[13px] leading-relaxed text-[#e5ecff] outline-none focus:border-[#6a8dff]"
      />
      {error && <p className="mt-2 text-xs text-[#ff7a7a]">{error}</p>}
    </Modal>
  );
}

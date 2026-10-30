/* File access with a Tauri-first, web-fallback strategy.
 *
 * Inside the Tauri shell we use the native open/save dialogs + fs plugin.
 * Running as a plain web page (vite dev / preview), we fall back to a
 * hidden <input type=file> for opening and an <a download> for saving,
 * so the whole app stays usable without Rust.
 */
import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export interface OpenedFile {
  path: string | null;
  name: string;
  content: string;
}

async function openViaWeb(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        resolve({ path: null, name: file.name, content: String(reader.result ?? "") });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    // Cancelled picker fires no event; resolve null on window refocus as fallback.
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => resolve(null), 300);
    };
    window.addEventListener("focus", onFocus);
    input.click();
  });
}

export async function openJsonFile(): Promise<OpenedFile | null> {
  if (isTauri()) {
    const selected = await dialogOpen({
      title: "Open JSON",
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected || Array.isArray(selected)) return null;
    const content = await readTextFile(selected);
    const name = selected.split(/[\\/]/).pop() ?? selected;
    return { path: selected, name, content };
  }
  return openViaWeb();
}

async function saveViaWeb(name: string, content: string): Promise<string | null> {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name.endsWith(".json") ? name : `${name}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}

export async function saveJsonFile(
  suggestedName: string,
  content: string,
  existingPath: string | null,
): Promise<string | null> {
  if (isTauri()) {
    let target = existingPath;
    if (!target) {
      target =
        (await dialogSave({
          title: "Save JSON As",
          defaultPath: suggestedName.endsWith(".json") ? suggestedName : `${suggestedName}.json`,
          filters: [{ name: "JSON", extensions: ["json"] }],
        })) ?? null;
      if (!target) return null;
    }
    await writeTextFile(target, content);
    return target;
  }
  await saveViaWeb(suggestedName || "untitled.json", content);
  return existingPath;
}

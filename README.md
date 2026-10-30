# Joisson (Tauri + React)

A rewrite of the Tkinter JSON editor (`../Joisson_tk`) as a modern Tauri + React
desktop app. **Functionality is ported; the UI is redesigned.**

## Status

| Layer | State |
|---|---|
| React/TypeScript app | ✅ Complete, typechecks, builds, SSR + unit smoke tests pass |
| Tauri shell (`src-tauri`) | ✅ Scaffolded, plugins + permissions wired |
| Rust compile / native exe | ⬜ Needs Rust toolchain (not installed on this machine) |

## Run it (web mode — works right now)

```powershell
npm install     # once
npm run dev     # http://localhost:1420
```

The app detects Tauri (`isTauri()` in `src/lib/files.ts`); outside the Tauri
shell, Open/Save fall back to the browser file picker + download, so every
feature is usable in a plain browser.

## Run it as a desktop app (requires Rust)

1. Install Rust: <https://rustup.rs> (restart the terminal afterwards)
2. ```powershell
   npm run tauri dev      # development
   npm run tauri build     # installer in src-tauri\target\release\bundle
   ```

## Tests

```powershell
# TypeScript
npx tsc --noEmit

# JSON model unit tests (mirrors the Tk semantics)
npx vite build --ssr src/opsSmoke.ts --outDir dist-ssr; node dist-ssr/opsSmoke.js

# Full-app render smoke test
npx vite build --ssr src/ssrSmoke.tsx --outDir dist-ssr; node dist-ssr/ssrSmoke.js
```

## Ported functionality (from the Tk version)

- Two views of any JSON document in the left panel:
  - **Tree**: expand/collapse, type chips, value previews, color-coded types,
    selection
  - **Mind map**: auto-laid-out map with curved links and five layouts —
    **Flow** (left to right), **Reverse** (right to left), **Split** (both sides
    of the root), **Outline** (top down) and **Levels** (one column per depth).
    The corner Layout picker previews each layout as a small diagram and applies
    it immediately, re-framing the map. Click a node to select it (selection and
    expansion are shared with the tree, so the right panel and Expand/Collapse
    All stay in sync), click a collapsed node to expand it, click its − badge to
    collapse, double-click to edit, right-click for the usual menu; drag to pan,
    ctrl+scroll (or the corner controls) to zoom, Fit re-frames the document.
    Expanding keeps the clicked node under the cursor; bulk Expand/Collapse All
    re-fits the view
- Right-click menu: **Add &lt;node&gt;** (batch form for object collections),
  Add Child, **Edit &lt;node&gt;** / Edit Value, Rename, Duplicate,
  Delete Children, Delete
- Double-click rule: only double-clicking the *name* opens the editor
  (expander chevron / columns do not) — same as the Tk fix
- Form-style object editor: prefilled + pre-select on open, nested objects and
  array fields via "Edit (set)" (both prefilled; arrays open the visual array
  editor), "Edit as JSON" raw mode, Add field
- Leaf edit via the form (verbatim mode: `"123"` stays a string)
- Visual array editor: items listed in order, drag rows to reorder, per-item
  Edit (objects and nested arrays open their own editors), delete, add item,
  plus an "Edit as JSON" raw mode
- Add Child: prompt key, then raw-JSON value entry (with parse toggle)
- Rename refuses existing keys; Duplicate appends `_copy` (unique keys `base_1…`)
- New / Open / Save / Save As (Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S)
- Expand All / Collapse All, dirty indicator, status line, toasts + confirm
  dialogs (replacing Tk messageboxes)
- Right panel with two views of the selected node (with its path) + Copy:
  **Selected JSON** (read-only, with a sticky Edit toggle that turns the panel
  into a JSON editor for that node — it stays on while you move around the tree,
  Apply/Cancel) and **Form** (the same form editor
  as right-click → Edit, rendered inline instead of in a dialog: fields for
  objects, the draggable item list for arrays, a single field for leaves).
  The chosen view and the JSON edit mode are remembered between launches
  (localStorage)

## Deliberately new (not copied)

- Custom dark UI (no ttkbootstrap equivalent needed) — Tailwind v4
- Floating context menu instead of Tk popup menu
- Split view with live output instead of the Tk right panel layout
- No frameless-window hacks; the Tauri window uses the OS decorations and
  `data-tauri-drag-region` is on the header for future decorationless mode

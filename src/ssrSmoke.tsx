// SSR smoke-test entry: renders <App /> to a string to catch runtime errors.
import { renderToString } from "react-dom/server";
import App from "./App";

declare const process: { exit(code?: number): void };

const html = renderToString(<App />);
const probes = ["Joisson", "Selected JSON", "root (JSON)", "Expand All"];
let failed = false;
for (const p of probes) {
  const ok = html.includes(p);
  console.log(`${p}: ${ok ? "FOUND" : "MISSING"}`);
  if (!ok) failed = true;
}
// Provider/Model quick-adds were app-specific and must be gone.
for (const gone of ["Add Provider", "Add Model"]) {
  const absent = !html.includes(gone);
  console.log(`${gone}: ${absent ? "GONE" : "STILL PRESENT"}`);
  if (!absent) failed = true;
}
if (failed) {
  console.error("SSR SMOKE FAILED");
  process.exit(1);
}
console.log(`SSR OK (${html.length} chars)`);

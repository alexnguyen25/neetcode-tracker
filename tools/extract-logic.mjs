import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Everything before this marker is pure declarations: constants, `state`, and
// function definitions. Everything after it is DOM wiring plus the boot() call,
// which needs a browser. Splitting here gives us the logic with no side effects.
const DOM_MARKER = 'document.getElementById("nav")';

const EXPORTS = [
  "PROBLEMS_SEED", "ROBLOX_SEED", "ROBLOX_META", "CAT_ORDER", "DEFAULT_INTERVALS",
  "RBX_INTERVALS", "RBX_DATE", "state", "initProblems", "genReviews", "intervals",
  "ladderFor", "offsetFor", "isRbx", "probById", "addDaysISO", "todayISO", "dayDiff",
  "allCats", "solveProblem", "applySolveDate", "reactivateProblem", "rbxSolvedCount",
  "RBX_GROUPS",
];

export function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const open = html.indexOf("<script>");
  if (open === -1) throw new Error("no <script> block found in index.html");
  let src = html.slice(open + "<script>".length);
  const cut = src.indexOf(DOM_MARKER);
  if (cut === -1) throw new Error(`DOM marker not found: ${DOM_MARKER}`);
  src = src.slice(0, cut);

  const ctx = {
    console,
    window: {},
    fetch: () => { throw new Error("network disabled in tests"); },
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  vm.createContext(ctx);

  // Only export bindings that actually exist, so this harness keeps working
  // as constants are added across tasks.
  const picker = EXPORTS
    .map((n) => `try { __out.${n} = ${n}; } catch (e) {}`)
    .join("\n");
  vm.runInContext(`${src}\n;this.__out = {};\n${picker}`, ctx);
  return ctx.__out;
}

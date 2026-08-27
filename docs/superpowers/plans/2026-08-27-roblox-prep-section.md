# Roblox Interview Prep Section — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth view to the tracker holding all 98 problems from the Roblox master DSA list, with their source metadata and link-confidence marks, reusing the existing solve/comfort/notes/review machinery.

**Architecture:** The master list is immutable reference data, so it is hard-coded into `index.html` as two constants. Mutable per-problem state (solved, comfort, notes, date) rides the existing 12 Sheet columns, which means `Code.gs` and the deployed Apps Script are untouched. The 20 problems already in the tracker are referenced by their existing ids and never duplicated. Roblox problems get a compressed 4-step review ladder while NeetCode problems keep the 6-step one.

**Tech Stack:** Vanilla JS in a single HTML file. Node 24 + `node:vm` + `node:test` for logic tests. Google Apps Script backend (unchanged).

**Spec:** `docs/superpowers/specs/2026-08-27-roblox-prep-section-design.md`

## Global Constraints

- **Do not modify `Code.gs`.** No new Sheet columns, no Apps Script re-deploy. Adding a column would require the user to re-deploy the web app.
- **Do not write to the live Google Sheet during development.** Blank `CONFIG.SCRIPT_URL` locally to force demo mode. Never commit a blanked URL.
- Roblox problem ids occupy **2001–2078**. Hand-added custom problems occupy **1001–1999**. These bands must not overlap.
- The Roblox review ladder is **`[1, 2, 4, 7]`**. The global ladder stays **`[1, 3, 7, 14, 30, 60]`**.
- `diff` values must be exactly `"Easy"`, `"Medium"`, or `"Hard"` — `diffTag` renders them as CSS class names and any other value renders unstyled.
- Total problem count after this work is **228** (150 NeetCode + 78 new Roblox). Any user-facing copy saying "150" must be checked.
- Target date is **2026-09-08**. Store it as a constant, never a hard-coded day count.
- Single-file deploy is a hard requirement: all app code stays in `index.html`. Test files live outside it.

## Spec amendment (approved deviation)

The spec says `cat` gets **two** additions to `CAT_ORDER` (`"Matrix / Grid"`, `"Design / OOP"`). Implementation needs a **third: `"SQL"`**. The two SQL problems have no nearest NeetCode category, and filing them under "Math & Geometry" would be actively misleading. Three additions total.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `index.html` | Entire app. Gains 2 data constants, 3 helpers, 1 view, 1 nav tab, ladder routing. | Modify |
| `tools/extract-logic.mjs` | Loads `index.html`, evaluates the declarations-only prefix of its `<script>` in a `node:vm` context, returns the app's functions and state for testing. The seam is the literal string `document.getElementById("nav")` — everything before it is pure declarations. | Create |
| `tools/roblox-data.test.mjs` | Tests the data constants: counts, id bands, resolution, difficulty values. | Create |
| `tools/roblox-logic.test.mjs` | Tests `isRbx`, `ladderFor`, `offsetFor`, and the `initProblems` de-duplication fix. | Create |
| `Code.gs` | Untouched. | — |

`tools/` is new. The project has no existing test directory and no package.json; `node:test` needs neither.

---

### Task 1: Test harness

Nothing else in this plan can be verified without this. It must come first.

**Files:**
- Create: `tools/extract-logic.mjs`
- Test: `tools/harness.test.mjs`

**Interfaces:**
- Produces: `loadApp()` → object exposing every top-level binding named in the `EXPORTS` array (`PROBLEMS_SEED`, `CAT_ORDER`, `state`, `initProblems`, `genReviews`, `intervals`, `probById`, `addDaysISO`, `todayISO`, and later `ROBLOX_SEED`, `ROBLOX_META`, `isRbx`, `ladderFor`, `offsetFor`). Each call returns a **fresh** context so tests cannot leak state into each other.

- [ ] **Step 1: Write the failing test**

Create `tools/harness.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./extract-logic.mjs";

test("harness exposes the seed and category order", () => {
  const app = loadApp();
  assert.equal(app.PROBLEMS_SEED.length, 150);
  assert.ok(Array.isArray(app.CAT_ORDER));
});

test("each loadApp call is isolated", () => {
  const a = loadApp();
  const b = loadApp();
  a.initProblems(null);
  assert.equal(a.state.problems.length > 0, true);
  assert.equal(b.state.problems.length, 0, "b must not see a's mutations");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tools/harness.test.mjs`
Expected: FAIL — `Cannot find module './extract-logic.mjs'`

- [ ] **Step 3: Implement the harness**

Create `tools/extract-logic.mjs`:

```js
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
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test tools/harness.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/extract-logic.mjs tools/harness.test.mjs
git commit -m "test: add node harness for index.html logic

Evaluates the declarations-only prefix of the app's script in a vm
context so pure logic can be unit tested without a browser."
```

---

### Task 2: Fix the `initProblems` duplication bug

This is a precondition, not an enhancement. Without it the feature is broken on the second page load. Do it before adding any Roblox data so the test proves the fix in isolation.

**Files:**
- Modify: `index.html:1334-1349` (`initProblems`)
- Test: `tools/roblox-logic.test.mjs`

**Interfaces:**
- Consumes: `loadApp()` from Task 1.
- Produces: `initProblems(seedById)` no longer re-adds Sheet rows whose id belongs to a code seed. `customSeq` is confined to 1001–1999.

- [ ] **Step 1: Write the failing test**

Create `tools/roblox-logic.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./extract-logic.mjs";

// Simulates a Sheet that already contains rows for code-seeded problems.
function sheetRows(ids) {
  const by = {};
  for (const id of ids) {
    by[id] = { id, name: `row ${id}`, cat: "Arrays & Hashing", diff: "Medium",
      blind: false, num: 0, url: "", status: "Solved", comfort: 4,
      dateSolved: "2026-08-01", notes: "", retired: false };
  }
  return by;
}

test("a Sheet row for a seeded id does not create a duplicate", () => {
  const app = loadApp();
  // id 2001 is a code-seeded Roblox problem; 1005 is a real hand-added one.
  app.initProblems(sheetRows([3, 2001, 1005]));
  const ids = app.state.problems.map((p) => p.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicated ids: ${dupes}`);
  assert.equal(ids.filter((id) => id === 2001).length, 1);
});

test("hand-added problems above 1000 still load", () => {
  const app = loadApp();
  app.initProblems(sheetRows([1005]));
  assert.ok(app.state.problems.some((p) => p.id === 1005), "1005 must survive");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tools/roblox-logic.test.mjs`
Expected: FAIL on the first test — id 2001 appears twice (once it exists as a seed in Task 3; before Task 3 the test still passes trivially for 2001 but must pass for the 1005 case). If the first test passes before Task 3, that is expected — re-run it after Task 3 and confirm it still passes.

- [ ] **Step 3: Implement the fix**

In `index.html`, replace the body of `initProblems` (currently lines 1334–1349):

```js
function initProblems(seed){
  const codeSeed = PROBLEMS_SEED.concat(ROBLOX_SEED);
  const seededIds = new Set(codeSeed.map(p=>p.id));
  const base = codeSeed.map(p=>{
    const s = seed && seed[p.id];
    return { ...p,
      status: s ? s.status : "Todo",
      comfort: s ? (s.comfort||0) : 0,
      dateSolved: s ? (s.dateSolved||null) : null,
      notes: s && s.notes ? s.notes : "",
      retired: !!(s && s.retired) };
  });
  const custom = [];
  // Only rows the code does not seed are user-added. Without the seededIds
  // guard, Roblox ids (2001+) satisfy `>= 1001` and get added a second time.
  if(seed) Object.values(seed).forEach(s=>{
    if(s.id >= 1001 && !seededIds.has(s.id)) custom.push({ ...s, notes:s.notes||"", retired:!!s.retired });
  });
  state.problems = base.concat(custom);
  // customSeq stays in the 1001-1999 band so hand-added problems never collide
  // with the Roblox range at 2001+.
  const cids = state.problems.filter(p=>p.id>=1001 && p.id<2000).map(p=>p.id);
  customSeq = (cids.length ? Math.max(...cids) : 1000) + 1;
}
```

Note this references `ROBLOX_SEED`, which Task 3 creates. To keep the repo runnable between tasks, add the empty constant now, immediately after `PROBLEMS_SEED`'s closing `];`:

```js
const ROBLOX_SEED = [];
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test tools/`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add index.html tools/roblox-logic.test.mjs
git commit -m "fix: stop initProblems duplicating code-seeded problems

Any Sheet row with id >= 1001 was treated as user-added, so seeded
problems in that range were loaded twice on the second page load.
Confine customSeq to 1001-1999 as well."
```

---

### Task 3: The data constants

**Files:**
- Modify: `index.html` — `ROBLOX_SEED` (replace the empty array from Task 2), add `ROBLOX_META`, `RBX_DATE`, `isRbx`; extend `CAT_ORDER`.
- Test: `tools/roblox-data.test.mjs`

**Interfaces:**
- Produces:
  - `ROBLOX_SEED`: 78 objects `{id, name, cat, diff, blind:false, num:0, url}`, ids 2001–2078.
  - `ROBLOX_META`: object keyed by problem id (98 keys) → `{rcat, sources, signal, onsite, fp, fp2, fpVerified, conf, warn}`.
  - `isRbx(id)` → boolean.
  - `RBX_DATE` = `"2026-09-08"`.
  - `RBX_GROUPS`: array of the 12 group names in list order.

**Data notes — three hand-authored corrections the source markdown cannot supply:**

1. **Entry 74** renders in the markdown as `Most Frequent Call [Path](url) / [Stack](url)` — a naive title parse yields `"Most Frequent Call [Path](https://..."`. Correct name is `"Most Frequent Call Path in Interleaved Logs"`, and it carries **two** FastPrep URLs, hence the `fp2` field.
2. **"Design a Like/Unlike Service"** has difficulty `Sys design` in the source. Store `diff: "Hard"` (so `diffTag` renders a valid class) and put the true label in `warn: "System design, not a coding problem"`.
3. **LeetCode numbers are absent from the source.** Set `num: 0` for all 78; the Index view renders `—`, which is honest. Do not invent numbers.

- [ ] **Step 1: Write the failing test**

Create `tools/roblox-data.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./extract-logic.mjs";

const VALID_DIFF = new Set(["Easy", "Medium", "Hard"]);

test("ROBLOX_SEED has 78 problems in the 2001-2078 band", () => {
  const app = loadApp();
  assert.equal(app.ROBLOX_SEED.length, 78);
  const ids = app.ROBLOX_SEED.map((p) => p.id).sort((a, b) => a - b);
  assert.equal(ids[0], 2001);
  assert.equal(ids[77], 2078);
  assert.equal(new Set(ids).size, 78, "ids must be unique");
});

test("every seeded difficulty is a renderable CSS class", () => {
  const app = loadApp();
  for (const p of app.ROBLOX_SEED) {
    assert.ok(VALID_DIFF.has(p.diff), `${p.name} has diff "${p.diff}"`);
  }
});

test("ROBLOX_META covers 98 problems and every id resolves", () => {
  const app = loadApp();
  const metaIds = Object.keys(app.ROBLOX_META).map(Number);
  assert.equal(metaIds.length, 98);
  app.initProblems(null);
  for (const id of metaIds) {
    assert.ok(app.probById(id), `meta id ${id} resolves to no problem`);
  }
});

test("the 20 overlaps point at existing NeetCode ids, not new ones", () => {
  const app = loadApp();
  const overlaps = [3, 9, 14, 16, 20, 21, 27, 47, 48, 61,
                    68, 84, 87, 88, 97, 131, 132, 134, 136, 137];
  for (const id of overlaps) {
    assert.ok(app.ROBLOX_META[id], `overlap ${id} missing from ROBLOX_META`);
  }
  const seededIds = new Set(app.ROBLOX_SEED.map((p) => p.id));
  for (const id of overlaps) {
    assert.ok(!seededIds.has(id), `overlap ${id} must not be re-seeded`);
  }
});

test("group totals match the master list", () => {
  const app = loadApp();
  const expected = {
    "Matrix / Grid Simulation": 17, "Arrays / Intervals / Two Pointers": 21,
    "Strings": 15, "Design / OOP": 13, "Sliding Window": 7,
    "Hash Table / Counting / Logs": 7, "Heap / Scheduling": 4,
    "Graphs / Topological Sort": 3, "Trees": 4, "DP / Bitmask": 2,
    "Math / Misc": 3, "SQL": 2,
  };
  const actual = {};
  for (const m of Object.values(app.ROBLOX_META)) {
    actual[m.rcat] = (actual[m.rcat] || 0) + 1;
  }
  assert.deepEqual(actual, expected);
  assert.equal(Object.values(expected).reduce((a, b) => a + b), 98);
});

test("isRbx distinguishes Roblox problems from NeetCode ones", () => {
  const app = loadApp();
  assert.equal(app.isRbx(2001), true, "2001 is Roblox");
  assert.equal(app.isRbx(68), true, "Task Scheduler is an overlap");
  assert.equal(app.isRbx(1), false, "Contains Duplicate is not");
});

test("the three new categories are registered in CAT_ORDER", () => {
  const app = loadApp();
  for (const c of ["Matrix / Grid", "Design / OOP", "SQL"]) {
    assert.ok(app.CAT_ORDER.includes(c), `${c} missing from CAT_ORDER`);
  }
});

test("every seeded cat is a known category", () => {
  const app = loadApp();
  const known = new Set(app.CAT_ORDER);
  for (const p of app.ROBLOX_SEED) {
    assert.ok(known.has(p.cat), `${p.name} has unknown cat "${p.cat}"`);
  }
});

test("exactly six entries are onsite-tagged", () => {
  const app = loadApp();
  const onsite = Object.values(app.ROBLOX_META).filter((m) => m.onsite);
  assert.equal(onsite.length, 6);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tools/roblox-data.test.mjs`
Expected: FAIL — `ROBLOX_SEED.length` is 0, `ROBLOX_META` is undefined.

- [ ] **Step 3: Add the three new categories**

In `index.html`, extend `CAT_ORDER` (line 536) by appending three entries before the closing bracket:

```js
const CAT_ORDER = ["Arrays & Hashing","Two Pointers","Sliding Window","Stack","Binary Search","Linked List","Trees","Tries","Heap / Priority Queue","Backtracking","Graphs","Advanced Graphs","1-D Dynamic Programming","2-D Dynamic Programming","Greedy","Intervals","Math & Geometry","Bit Manipulation","Matrix / Grid","Design / OOP","SQL"];
```

- [ ] **Step 4: Write the data constants**

Replace `const ROBLOX_SEED = [];` from Task 2 with the 78 entries below, then add `ROBLOX_META`, `RBX_GROUPS`, `RBX_DATE`, and `isRbx` immediately after.

The `cat` column below is the authored NeetCode-taxonomy mapping — it is a judgment call and is the reason this table is spelled out rather than generated. Read the source list at `~/Downloads/roblox-dsa-master-list.md` for the `url`, `sources`, `fp`, and `conf` values of each row; the table gives id, name, diff, cat, and rcat.

| id | name | diff | cat | rcat |
|---|---|---|---|---|
| 2001 | Candy Crush | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2002 | Minimum Operations to Write the Letter Y on a Grid | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2003 | Rotating the Box | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2004 | Image Smoother | Easy | Matrix / Grid | Matrix / Grid Simulation |
| 2005 | Number of Black Blocks | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2006 | Number of Adjacent Elements With the Same Color | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2007 | Length of Longest V-Shaped Diagonal Segment | Hard | Matrix / Grid | Matrix / Grid Simulation |
| 2008 | Find Longest Diagonal Segment | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2009 | Sorted Extended Matrix Diagonals | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2010 | Grid Pathfinding with Obstacles (DFS) | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2011 | Robot Navigation Around Lasers | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2012 | Count House Segments After Destruction | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2013 | Longest Contiguous House Segment | Medium | Matrix / Grid | Matrix / Grid Simulation |
| 2014 | Maximize Distance to Closest Person | Medium | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2015 | Brightest Position on Street | Medium | Intervals | Arrays / Intervals / Two Pointers |
| 2016 | Number of Flowers in Full Bloom | Hard | Intervals | Arrays / Intervals / Two Pointers |
| 2017 | Minimum Absolute Difference Between Elements With Constraint | Medium | Binary Search | Arrays / Intervals / Two Pointers |
| 2018 | Magnetic Force Between Two Balls | Medium | Binary Search | Arrays / Intervals / Two Pointers |
| 2019 | Restore the Array From Adjacent Pairs | Medium | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2020 | Count Nice Pairs in an Array | Medium | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2021 | Employee Free Time | Hard | Intervals | Arrays / Intervals / Two Pointers |
| 2022 | Minimum Height Difference Between Distant Peaks | Medium | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2023 | Make Towers Strictly Increasing or Decreasing | Medium | Greedy | Arrays / Intervals / Two Pointers |
| 2024 | Dynamic Pair Sum Queries | Medium | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2025 | Find Number of Valid Pairs | Easy | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2026 | Find Max Number of Pairs | Easy | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2027 | Count Pairs | Easy | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2028 | Flatten Nested Array | Medium | Stack | Arrays / Intervals / Two Pointers |
| 2029 | Cursor-Based Pagination Over Sorted Logs | Medium | Arrays & Hashing | Arrays / Intervals / Two Pointers |
| 2030 | Integer to English Words | Hard | Math & Geometry | Strings |
| 2031 | Text Justification | Hard | Arrays & Hashing | Strings |
| 2032 | Find the Length of the Longest Common Prefix | Medium | Tries | Strings |
| 2033 | Reorganize String | Medium | Heap / Priority Queue | Strings |
| 2034 | Subdomain Visit Count | Medium | Arrays & Hashing | Strings |
| 2035 | Split Message Based on Limit | Hard | Arrays & Hashing | Strings |
| 2036 | Minimum Number of Frogs Croaking | Medium | Arrays & Hashing | Strings |
| 2037 | Longest Common Prefix | Easy | Arrays & Hashing | Strings |
| 2038 | Rotate String | Easy | Arrays & Hashing | Strings |
| 2039 | Simplify Path | Medium | Stack | Strings |
| 2040 | Break a Palindrome | Medium | Two Pointers | Strings |
| 2041 | Cyclic Shift Pairs | Medium | Arrays & Hashing | Strings |
| 2042 | Remove Prefix Strings | Medium | Tries | Strings |
| 2043 | Suffix Pairs | Medium | Tries | Strings |
| 2044 | Design Browser History | Medium | Design / OOP | Design / OOP |
| 2045 | Design Search Autocomplete System | Hard | Design / OOP | Design / OOP |
| 2046 | Design Hit Counter | Medium | Design / OOP | Design / OOP |
| 2047 | Number of Recent Calls | Easy | Design / OOP | Design / OOP |
| 2048 | Design Memory Allocator | Medium | Design / OOP | Design / OOP |
| 2049 | Logger Rate Limiter | Easy | Design / OOP | Design / OOP |
| 2050 | Insert Delete GetRandom O(1) | Medium | Design / OOP | Design / OOP |
| 2051 | Random Pick with Weight | Medium | Design / OOP | Design / OOP |
| 2052 | Implement a Rate Limiter | Medium | Design / OOP | Design / OOP |
| 2053 | Rate Limit by Multiple Request Fields | Medium | Design / OOP | Design / OOP |
| 2054 | Rate Limiter Sliding Window With Per-Entity Limits | Medium | Design / OOP | Design / OOP |
| 2055 | Design a Like/Unlike Service | Hard | Design / OOP | Design / OOP |
| 2056 | Count the Number of Good Subarrays | Medium | Sliding Window | Sliding Window |
| 2057 | Count Number of Nice Subarrays | Medium | Sliding Window | Sliding Window |
| 2058 | Subarrays with K Different Integers | Hard | Sliding Window | Sliding Window |
| 2059 | Maximum Number of Occurrences of a Substring | Medium | Sliding Window | Sliding Window |
| 2060 | Sliding Window: Target Containment and Most-Repeated Window | Medium | Sliding Window | Sliding Window |
| 2061 | Most Frequent Call Path in Interleaved Logs | Medium | Stack | Hash Table / Counting / Logs |
| 2062 | Accounts Merge | Medium | Graphs | Hash Table / Counting / Logs |
| 2063 | Maximum Number of Balls in a Box | Easy | Arrays & Hashing | Hash Table / Counting / Logs |
| 2064 | Largest Value of Usage in Minutes | Easy | Arrays & Hashing | Hash Table / Counting / Logs |
| 2065 | Event ID Check Completion Times | Medium | Arrays & Hashing | Hash Table / Counting / Logs |
| 2066 | Highest-Earning Experience Tracker | Medium | Arrays & Hashing | Hash Table / Counting / Logs |
| 2067 | Group the People Given the Group Size They Belong To | Medium | Greedy | Heap / Scheduling |
| 2068 | Single-Threaded CPU | Medium | Heap / Priority Queue | Heap / Scheduling |
| 2069 | Phone Battery Discharge Scheduling | Medium | Heap / Priority Queue | Heap / Scheduling |
| 2070 | Closest Binary Search Tree Value | Easy | Trees | Trees |
| 2071 | Search in a Binary Search Tree | Easy | Trees | Trees |
| 2072 | Number of Ways to Wear Different Hats to Each Other | Hard | 2-D Dynamic Programming | DP / Bitmask |
| 2073 | Minimum Falling Path Sum II | Hard | 2-D Dynamic Programming | DP / Bitmask |
| 2074 | Block Placement Queries | Hard | Math & Geometry | Math / Misc |
| 2075 | Basic Calculator IV | Hard | Stack | Math / Misc |
| 2076 | Convert Binary Number in a Linked List to Integer | Easy | Linked List | Math / Misc |
| 2077 | Students and Examinations | Easy | SQL | SQL |
| 2078 | Number of Trusted Contacts of a Customer | Medium | SQL | SQL |

The 20 overlap ids and their `rcat`, for the `ROBLOX_META`-only entries:

| id | name | rcat |
|---|---|---|
| 27 | Largest Rectangle in Histogram | Matrix / Grid Simulation |
| 136 | Rotate Image | Matrix / Grid Simulation |
| 137 | Spiral Matrix | Matrix / Grid Simulation |
| 84 | Rotting Oranges | Matrix / Grid Simulation |
| 131 | Merge Intervals | Arrays / Intervals / Two Pointers |
| 132 | Non-overlapping Intervals | Arrays / Intervals / Two Pointers |
| 14 | Trapping Rain Water | Arrays / Intervals / Two Pointers |
| 3 | Two Sum | Arrays / Intervals / Two Pointers |
| 134 | Meeting Rooms II | Arrays / Intervals / Two Pointers |
| 21 | Valid Parentheses | Strings |
| 61 | Implement Trie (Prefix Tree) | Design / OOP |
| 16 | Longest Substring Without Repeating Characters | Sliding Window |
| 20 | Sliding Window Maximum | Sliding Window |
| 9 | Longest Consecutive Sequence | Hash Table / Counting / Logs |
| 68 | Task Scheduler | Heap / Scheduling |
| 88 | Course Schedule II | Graphs / Topological Sort |
| 87 | Course Schedule | Graphs / Topological Sort |
| 97 | Alien Dictionary | Graphs / Topological Sort |
| 47 | Maximum Depth of Binary Tree | Trees |
| 48 | Diameter of Binary Tree | Trees |

The **6 onsite-tagged** entries (`onsite: true`), per the spec's Caveats section: Most Frequent Call Path in Interleaved Logs (2061), Maximize Distance to Closest Person (2014), Sliding Window Target Containment (2060), Cursor-Based Pagination (2029), Implement Trie (61), Highest-Earning Experience Tracker (2066). Every other entry is `onsite: false`.

`signal` is `(number of distinct sources) + (peak GitHub count)`, computed from the `Sources` column. Worked examples: `G15 · L · T` → 3 + 15 = **18**; `G18 · L · T` → 3 + 18 = **21**; `L` → 1 + 0 = **1**; `E · G2 · L` → 3 + 2 = **5**.

`warn` is set on exactly two entries: 2069 Phone Battery Discharge Scheduling → `"FastPrep flags this as author-written, 0% match to verified source material — not a real Roblox question"`, and 2055 Design a Like/Unlike Service → `"System design, not a coding problem"`.

Then append the helpers:

```js
const RBX_GROUPS = ["Matrix / Grid Simulation","Arrays / Intervals / Two Pointers","Strings",
  "Design / OOP","Sliding Window","Hash Table / Counting / Logs","Heap / Scheduling",
  "Graphs / Topological Sort","Trees","DP / Bitmask","Math / Misc","SQL"];
const RBX_DATE = "2026-09-08";
const RBX_INTERVALS = [1, 2, 4, 7];
const isRbx = id => Object.prototype.hasOwnProperty.call(ROBLOX_META, id);
```

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `node --test tools/`
Expected: PASS. All 9 data tests plus Tasks 1–2 tests. If the group-totals test fails, the `rcat` assignment is wrong somewhere — the diff between actual and expected names the group.

- [ ] **Step 6: Commit**

```bash
git add index.html tools/roblox-data.test.mjs
git commit -m "feat: add Roblox master-list data constants

78 new problems at ids 2001-2078 plus metadata for all 98 including
the 20 that already existed. Adds Matrix / Grid, Design / OOP, and
SQL categories."
```

---

### Task 4: Per-problem review ladder

**Files:**
- Modify: `index.html` — add `ladderFor`/`offsetFor`; update `genReviews` (595), `reactivateProblem` (641), `applySolveDate` (650), `boot` (1352).
- Test: `tools/roblox-logic.test.mjs` (append)

**Interfaces:**
- Consumes: `isRbx(id)`, `RBX_INTERVALS` from Task 3.
- Produces: `ladderFor(p)` → number[]; `offsetFor(p, num)` → number. `state.settings.rbxIntervals` exists and persists.

**The edge case this task must handle deliberately.** Nine of the 20 overlaps are already solved and already carry six-review chains on the global ladder. They are Roblox problems by `isRbx`, so `ladderFor` returns a 4-element array. `applySolveDate` and `reactivateProblem` index the ladder by review number, so R5 and R6 would read `undefined` and silently collapse to the last element (+7 days), compressing two reviews the user already had scheduled at +30 and +60. `offsetFor` fixes this by falling back to the **global** ladder at that index before falling back to the last element.

- [ ] **Step 1: Write the failing test**

Append to `tools/roblox-logic.test.mjs`:

```js
test("ladderFor gives Roblox problems the compressed ladder", () => {
  const app = loadApp();
  app.initProblems(null);
  assert.deepEqual(app.ladderFor(app.probById(2001)), [1, 2, 4, 7]);
  assert.deepEqual(app.ladderFor(app.probById(68)), [1, 2, 4, 7], "overlap is Roblox");
  assert.deepEqual(app.ladderFor(app.probById(1)), [1, 3, 7, 14, 30, 60]);
});

test("solving a Roblox problem generates exactly 4 reviews", () => {
  const app = loadApp();
  app.initProblems(null);
  const p = app.probById(2001);
  p.dateSolved = "2026-08-27";
  app.genReviews(p);
  const due = app.state.reviews.filter((r) => r.problemId === 2001).map((r) => r.due);
  assert.deepEqual(due, ["2026-08-28", "2026-08-29", "2026-08-31", "2026-09-03"]);
});

test("solving a NeetCode problem still generates 6 reviews", () => {
  const app = loadApp();
  app.initProblems(null);
  const p = app.probById(1);
  p.dateSolved = "2026-08-27";
  app.genReviews(p);
  assert.equal(app.state.reviews.filter((r) => r.problemId === 1).length, 6);
});

test("offsetFor does not collapse R5/R6 of an already-solved overlap", () => {
  const app = loadApp();
  app.initProblems(null);
  const p = app.probById(68);
  // R1-R4 come from the compressed Roblox ladder...
  assert.equal(app.offsetFor(p, 1), 1);
  assert.equal(app.offsetFor(p, 4), 7);
  // ...but R5/R6 fall back to the global ladder, not to 7.
  assert.equal(app.offsetFor(p, 5), 30, "R5 must not collapse to 7");
  assert.equal(app.offsetFor(p, 6), 60, "R6 must not collapse to 7");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tools/roblox-logic.test.mjs`
Expected: FAIL — `app.ladderFor is not a function`.

- [ ] **Step 3: Add the helpers and route the call sites**

In `index.html`, next to `const intervals = () => state.settings.intervals;` (line 558), add:

```js
const rbxIntervals = () => state.settings.rbxIntervals || RBX_INTERVALS;
const ladderFor = p => (p && isRbx(p.id)) ? rbxIntervals() : intervals();
// Review numbers past the end of a problem's own ladder fall back to the
// global ladder at that index. Without this, the nine already-solved overlaps
// -- which carry six reviews on the old 6-step ladder -- would have R5 and R6
// silently compressed from +30/+60 to +7.
function offsetFor(p, num){
  const L = ladderFor(p);
  if(L[num-1] != null) return L[num-1];
  const G = intervals();
  return G[num-1] != null ? G[num-1] : L[L.length-1];
}
```

Update `state`'s default settings (line 542) to include the new ladder:

```js
settings: { intervals: DEFAULT_INTERVALS.slice(), rbxIntervals: RBX_INTERVALS.slice(), goal: { target: 150, date: null } }
```

`genReviews` (595) — use the problem's own ladder:

```js
function genReviews(p){
  ladderFor(p).forEach((days, i)=>{
    state.reviews.push({ id: reviewSeq++, problemId: p.id, num: i+1,
      due: addDaysISO(p.dateSolved, days), status:"due", result:null, doneOn:null });
  });
}
```

`reactivateProblem` (641) — replace the `r.due = ...` line:

```js
    r.due = addDaysISO(todayISO(), offsetFor(p, r.num));
```

`applySolveDate` (650) — replace the `r.due = ...` line:

```js
    r.due = addDaysISO(p.dateSolved, offsetFor(p, r.num));
```

`boot` (1352) — after the existing `intervals` restore, add a guarded restore:

```js
        if(Array.isArray(data.settings.rbxIntervals) && data.settings.rbxIntervals.length===4
           && data.settings.rbxIntervals.every(n=>Number.isFinite(n) && n>0))
          state.settings.rbxIntervals = data.settings.rbxIntervals;
```

Also update the settings reset inside `boot`'s synced branch (line ~1364) so a failed load restores both ladders:

```js
    state.settings = { intervals: DEFAULT_INTERVALS.slice(), rbxIntervals: RBX_INTERVALS.slice(), goal: { target: 150, date: null } };
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `node --test tools/`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add index.html tools/roblox-logic.test.mjs
git commit -m "feat: give Roblox problems a compressed 1/2/4/7 review ladder

offsetFor falls back to the global ladder for review numbers past the
end of a problem's own ladder, so the nine already-solved overlaps keep
their +30/+60 reviews instead of collapsing to +7."
```

---

### Task 5: Settings UI for both ladders

**Files:**
- Modify: `index.html` — `openSettings` (1206), `saveIntervals` (1236), `resetIntervals` (1235)

**Interfaces:**
- Consumes: `rbxIntervals()`, `RBX_INTERVALS` from Task 4.
- Produces: no new exports. `saveIntervals` persists both ladders.

This task is UI-only and not covered by the node harness (it builds DOM strings). Verified manually in Task 8.

- [ ] **Step 1: Add the second input row**

In `openSettings`, after the existing `inputs` const, add:

```js
  const riv = rbxIntervals();
  const rbxInputs = [0,1,2,3].map(i=>`
    <div><label class="fl">R${i+1} — days after</label>
      <input type="number" id="riv-${i}" value="${riv[i]!=null?riv[i]:RBX_INTERVALS[i]}" min="1" max="365" style="width:100%"></div>`).join("");
```

Then insert a new `.mblock` immediately after the existing intervals block, before the Save button block:

```html
        <div class="mblock">
          <div class="ml">Roblox interval ladder</div>
          <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">${rbxInputs}</div>
          <div class="hint" style="margin-top:12px">Compressed schedule for the 98 Roblox list problems, so each one comes back three or four times before Sep 8. Problems on both lists use this ladder.</div>
        </div>
```

- [ ] **Step 2: Persist both ladders**

Replace `saveIntervals` (1236):

```js
function saveIntervals(){
  const vals = [];
  for(let i=0;i<6;i++){ const el=document.getElementById("iv-"+i); vals.push(Math.max(1, parseInt(el.value,10)||DEFAULT_INTERVALS[i])); }
  state.settings.intervals = vals;
  const rvals = [];
  for(let i=0;i<4;i++){ const el=document.getElementById("riv-"+i); rvals.push(Math.max(1, parseInt(el.value,10)||RBX_INTERVALS[i])); }
  state.settings.rbxIntervals = rvals;
  scheduleSave(); closeModal(); refresh();
}
```

Replace `resetIntervals` (1235):

```js
function resetIntervals(){
  DEFAULT_INTERVALS.forEach((v,i)=>{ document.getElementById("iv-"+i).value=v; });
  RBX_INTERVALS.forEach((v,i)=>{ document.getElementById("riv-"+i).value=v; });
}
```

- [ ] **Step 3: Verify by hand**

Open `index.html` in a browser with `CONFIG.SCRIPT_URL` blanked. Open Settings via the footer link. Confirm two interval rows appear (6 inputs, then 4), that "Reset to default" resets both, and that Save closes the modal without a console error.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: expose the Roblox interval ladder in Settings"
```

---

### Task 6: The Roblox view

**Files:**
- Modify: `index.html` — nav (352-357), `filters` (546), `RENDERERS` (1261), `bindViewControls` (1262); add `viewRoblox` and helpers after `viewRecord` (ends ~1042).

**Interfaces:**
- Consumes: `ROBLOX_META`, `RBX_GROUPS`, `RBX_DATE`, `isRbx` (Task 3); existing `openProblem`, `toggleSolve`, `diffTag`, `comfortDots`, `nextReviewCell`, `fmtLong`, `dayDiff`, `todayISO`.
- Produces: `viewRoblox()` → HTML string; `rbxSolvedCount()` → number; `daysToRbx()` → number; filter keys `rbxOnsite`, `rbxSignal`.

- [ ] **Step 1: Write the failing test**

Append to `tools/roblox-logic.test.mjs`:

```js
test("rbxSolvedCount counts only solved Roblox problems", () => {
  const app = loadApp();
  app.initProblems(null);
  assert.equal(app.rbxSolvedCount(), 0);
  app.probById(2001).status = "Solved";
  app.probById(68).status = "Solved";   // an overlap counts too
  app.probById(1).status = "Solved";    // a NeetCode-only problem does not
  assert.equal(app.rbxSolvedCount(), 2);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tools/roblox-logic.test.mjs`
Expected: FAIL — `app.rbxSolvedCount is not a function`.

- [ ] **Step 3: Add the nav tab**

In the `<nav id="nav">` block, after the Record tab:

```html
    <button class="tab" data-v="roblox"><span class="n">05</span> Roblox</button>
```

- [ ] **Step 4: Add the filter keys**

Extend the `filters` object (line 546):

```js
let filters = { q:"", cat:"all", diff:"all", blind:false, unsolved:false, calShowDone:false, rbxQ:"", rbxDiff:"all", rbxUnsolved:false, rbxOnsite:false, rbxSignal:false };
```

Separate keys keep the Roblox view's filters from colliding with the Index view's.

- [ ] **Step 5: Implement the view**

Add after `viewRecord`:

```js
/* ====================== RENDER: Roblox ====================== */
function rbxProblems(){ return state.problems.filter(p=>isRbx(p.id)); }
function rbxSolvedCount(){ return rbxProblems().filter(p=>p.status==="Solved").length; }
function daysToRbx(){ return Math.max(0, dayDiff(RBX_DATE, todayISO())); }

function confMark(c){
  if(!c) return "";
  const m = { analogue:["~","analogue only — read before trusting"],
              unverified:["‡","slug derived from title, unverified"],
              derived:["†","slug derived from title, verified by search"],
              none:["—","no LeetCode equivalent"],
              flagged:["!","FastPrep flags this as not source-backed"] }[c];
  return m ? `<span class="conf" title="${m[1]}">${m[0]}</span>` : "";
}

function rbxRow(p){
  const m = ROBLOX_META[p.id];
  const links = [];
  if(p.url) links.push(`<a href="${p.url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">LC</a>`);
  if(m.fp) links.push(`<a href="${m.fp}" target="_blank" rel="noopener" class="${m.fpVerified?"":"unsure"}" onclick="event.stopPropagation()">FP</a>`);
  if(m.fp2) links.push(`<a href="${m.fp2}" target="_blank" rel="noopener" class="${m.fpVerified?"":"unsure"}" onclick="event.stopPropagation()">FP2</a>`);
  return `
    <tr class="${p.retired?"retired":p.status==="Solved"?"":"todo"}" onclick="openProblem(${p.id})">
      <td class="c" onclick="event.stopPropagation();toggleSolve(${p.id})">
        <span class="box ${p.status==="Solved"?"done":""}">${p.status==="Solved"?"✓":""}</span></td>
      <td><span class="pname">${p.name}</span>${confMark(m.conf)}${m.warn?` <span class="badge warn" title="${m.warn}">⚠</span>`:""}${hasNotes(p)?' <span class="note-dot" title="has notes">✎</span>':''}</td>
      <td>${diffTag(p.diff)}</td>
      <td><span class="num">${m.sources}</span></td>
      <td class="c">${m.onsite?'<span class="badge">onsite</span>':''}</td>
      <td class="c">${links.join(" ") || '<span class="num">—</span>'}</td>
      <td class="c">${p.status==="Solved"?comfortDots(p.comfort||0):'<span class="num">—</span>'}</td>
      <td class="r">${nextReviewCell(p)}</td>
    </tr>`;
}

function viewRoblox(){
  let list = rbxProblems();
  if(filters.rbxQ){ const q=filters.rbxQ.toLowerCase(); list=list.filter(p=>p.name.toLowerCase().includes(q)); }
  if(filters.rbxDiff!=="all") list=list.filter(p=>p.diff===filters.rbxDiff);
  if(filters.rbxUnsolved) list=list.filter(p=>p.status!=="Solved");
  if(filters.rbxOnsite) list=list.filter(p=>ROBLOX_META[p.id].onsite);
  if(filters.rbxSignal) list=list.filter(p=>ROBLOX_META[p.id].signal>=3);

  const total = rbxProblems().length, done = rbxSolvedCount(), d = daysToRbx();
  const groups = RBX_GROUPS.map(g=>{
    const inG = list.filter(p=>ROBLOX_META[p.id].rcat===g);
    if(!inG.length) return "";
    const gTotal = rbxProblems().filter(p=>ROBLOX_META[p.id].rcat===g);
    const gDone = gTotal.filter(p=>p.status==="Solved").length;
    return `
    <div class="sec"><h2><span class="g">§</span> ${g}</h2>
      <span class="meta">${gDone} of ${gTotal.length} solved</span></div>
    <div class="tblwrap"><table class="tbl">
      <thead><tr><th class="c">✓</th><th>Problem</th><th>Difficulty</th><th>Sources</th>
        <th class="c">Stage</th><th class="c">Links</th><th class="c">Comfort</th><th class="r">Next review</th></tr></thead>
      <tbody>${inG.map(rbxRow).join("")}</tbody>
    </table></div>`;
  }).join("");

  return `
  <div class="sec"><h2><span class="g">§</span> Roblox superday</h2>
    <span class="meta">${d===0?"today":`${d} day${d===1?"":"s"} out`} · ${fmtLong(RBX_DATE)} · ${done} of ${total} solved</span></div>
  <div class="loop">
    <span>Technical 2 — 5:45p</span><span>Technical 1 — 6:30p</span><span>Comm &amp; Collab — 7:15p</span>
  </div>
  <div class="filters">
    <input type="text" id="fr-q" placeholder="Search the 98…" value="${filters.rbxQ.replace(/"/g,'&quot;')}">
    <button class="chip ${filters.rbxDiff==='all'?'on':''}" onclick="setRbxDiff('all')">All</button>
    <button class="chip ${filters.rbxDiff==='Easy'?'on':''}" onclick="setRbxDiff('Easy')">Easy</button>
    <button class="chip ${filters.rbxDiff==='Medium'?'on':''}" onclick="setRbxDiff('Medium')">Medium</button>
    <button class="chip ${filters.rbxDiff==='Hard'?'on':''}" onclick="setRbxDiff('Hard')">Hard</button>
    <button class="chip ${filters.rbxUnsolved?'on':''}" onclick="toggleF('rbxUnsolved')">Unsolved</button>
    <button class="chip ${filters.rbxOnsite?'on rust':''}" onclick="toggleF('rbxOnsite')">Onsite only</button>
    <button class="chip ${filters.rbxSignal?'on':''}" onclick="toggleF('rbxSignal')">3+ sources</button>
  </div>
  ${groups || '<div class="empty" style="text-align:center;padding:40px">No problems match these filters.</div>'}
  <div class="sec"><h2><span class="g">§</span> Read before you trust a link</h2></div>
  <div class="caveats">
    <p><b>FastPrep reliability.</b> FastPrep re-audited its legacy author-written Roblox reports and found no original report supporting <i>Phone Battery Discharge Scheduling</i> — a 0% match to verified source material. At least one entry is invented and mislabeled. Read the source note on any FastPrep problem before treating it as real Roblox signal.</p>
    <p><b>Link marks.</b> <span class="conf">~</span> analogue only, shares a pattern but differs in specifics — practice the pattern, don't expect the question. <span class="conf">‡</span> slug derived from the title, unverified. <span class="conf">†</span> derived and verified by search. <span class="conf">—</span> no LeetCode equivalent. <span class="conf">!</span> FastPrep flags it as not source-backed.</p>
    <p><b>Stage matters.</b> Most of the FastPrep source is OA and phone-screen data — stages already cleared. Only six entries are onsite-tagged; the “Onsite only” filter above isolates them.</p>
    <p><b>Constructed URLs.</b> 27 of the 42 FastPrep links were built from a slug pattern rather than verified. Five of fifteen verified slugs diverge from their displayed titles, so expect roughly a third of the constructed ones to 404. Dimmed FP links are the unverified ones. If one 404s, search the title on FastPrep rather than editing the slug.</p>
    <p><b>Strongest signal.</b> Course Schedule II (all four sources) · Number of Ways to Wear Different Hats (E · G14 · L) · Maximize Distance to Closest Person (G18 · L · T) · Candy Crush (G15 · L · T) · Implement Trie (G7 · L · T) · Design Search Autocomplete System (G5 · L · T) · Design Hit Counter (E · G2 · L) · Number of Recent Calls (E · G2 · L). Highest single counts: Task Scheduler G22, Maximize Distance G18, Candy Crush G15, Hats G14.</p>
  </div>`;
}
function setRbxDiff(d){ filters.rbxDiff=d; refresh(); }
```

- [ ] **Step 6: Register the view**

Extend `RENDERERS` (1261):

```js
const RENDERERS = { today:viewToday, index:viewIndex, calendar:viewCalendar, record:viewRecord, roblox:viewRoblox };
```

In `bindViewControls` (1262), add the search binding alongside the existing `f-q` handler, matching how that one is written:

```js
  const rq = document.getElementById("fr-q");
  if(rq) rq.addEventListener("input", e=>{ filters.rbxQ = e.target.value; refresh(); });
```

Export the two new click handlers by adding them to the `Object.assign(window, {...})` call at the end of the script:

```js
  setRbxDiff,
```

- [ ] **Step 7: Add the styles**

Append to the `<style>` block, before `</style>`:

```css
.loop{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 18px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.7}
.conf{margin-left:5px;font-weight:600;opacity:.6;cursor:help}
.badge.warn{cursor:help}
a.unsure{opacity:.45}
.caveats{font-size:13px;line-height:1.65;max-width:76ch}
.caveats p{margin:0 0 12px}
```

- [ ] **Step 8: Run the tests and make sure they pass**

Run: `node --test tools/`
Expected: PASS, all tests.

- [ ] **Step 9: Commit**

```bash
git add index.html tools/roblox-logic.test.mjs
git commit -m "feat: add the Roblox view

Fifth tab grouping all 98 problems by the master list's own 12 groups,
with source counts, stage tags, link-confidence marks, and the caveats
that say which entries to trust."
```

---

### Task 7: Correct the stale "150" copy

Two user-facing strings say the pool is 150. One of them is the confirmation on an irreversible wipe, so it is telling the user something false at the worst moment.

**Files:**
- Modify: `index.html` — `resetAllData` (1236), the demo banner in `boot` (~1358)

- [ ] **Step 1: Fix the reset confirmation**

In `resetAllData`, replace both branches of `msg`:

```js
  const msg = mode==="synced"
    ? "Clear ALL progress — every solve, review, note, and custom problem — back to a blank 228, and overwrite your connected Sheet to match? This cannot be undone."
    : "Clear ALL progress back to a blank 228? This cannot be undone.";
```

- [ ] **Step 2: Check the reset body for the same number**

Read the rest of `resetAllData` and the Settings modal's "Clear everything" hint (which reads `back to a blank 150`). Replace every remaining user-facing `150` that refers to pool size with `228`. Do **not** change `goal.target: 150`, which is a goal, not a count.

Run this to find them all:

```bash
grep -n "blank 150\|of 150\|150 problems" index.html
```

Expected after the fix: no matches.

- [ ] **Step 3: Verify by hand**

Open the app with `CONFIG.SCRIPT_URL` blanked. Open Settings, read the "Clear everything" hint, and click the danger button. Confirm the dialog says 228. **Cancel it.**

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix: say 228 not 150 in reset copy

The pool grew by the 78 Roblox problems. The reset confirmation is
shown before an irreversible wipe, so the number has to be right."
```

---

### Task 8: End-to-end verification

No code here. This is the gate before the change touches the real Sheet, and it is where the two risks in the spec get retired.

- [ ] **Step 1: Back up the Sheet**

In the browser, open the Google Sheet and use **File ▸ Make a copy**. Name it `neetcode-ledger-backup-2026-08-27`. The first real load writes 78 new rows; this is the undo.

- [ ] **Step 2: Verify everything in demo mode first**

Temporarily blank `CONFIG.SCRIPT_URL` in a working copy — do not commit it:

```bash
cp index.html /tmp/rbx-demo.html
sed -i '' 's#SCRIPT_URL: "https://[^"]*"#SCRIPT_URL: ""#' /tmp/rbx-demo.html
open /tmp/rbx-demo.html
```

Check, with the browser console open and expecting zero errors:

- The Roblox tab renders 12 group sections summing to 98 rows with no filters applied.
- Clicking a row opens the existing detail modal; notes, comfort, and solve date all work.
- Each filter narrows the list; "Onsite only" leaves exactly 6; clearing restores 98.
- Switching to Index and back leaves each view's filters independent.
- The Index view's category dropdown contains Matrix / Grid, Design / OOP, and SQL.
- Solving a Roblox problem from the Roblox tab produces 4 reviews in the modal's history; solving a NeetCode problem from Index produces 6.

- [ ] **Step 3: Confirm the duplication fix against a real second load**

This is the bug that only appears on the second load, so it needs a real round-trip. With the true `SCRIPT_URL` restored, load the app once (which writes the 78 rows), then hard-reload (Cmd-Shift-R) and run in the console:

```js
state.problems.length
```

Expected: **228**. If it reads 306, the Task 2 guard is not working — stop and fix before doing anything else.

Then confirm no duplicate ids:

```js
(() => { const ids = state.problems.map(p => p.id);
  return ids.filter((id, i) => ids.indexOf(id) !== i); })()
```

Expected: `[]`.

- [ ] **Step 4: Confirm the nine solved overlaps survived**

In the console:

```js
[3,9,16,21,47,61,131,134,136].map(id => { const p = probById(id);
  return `${id} ${p.status} c=${p.comfort} ${p.dateSolved} r=${state.reviews.filter(r=>r.problemId===id).length}`; })
```

Expected: all nine still `Solved`, with the comfort values and solve dates recorded in the spec's overlap table, and **6** reviews each — not 4. Their existing chains must not have been regenerated. Confirm problem 16's notes are still present.

- [ ] **Step 5: Confirm the Record view still reads sensibly**

Open Record. The pool is now 228 against a goal target of 150. Confirm nothing renders as `NaN`, `Infinity`, or a percentage above 100. If it does, that is a real bug — report it rather than papering over it; the spec flagged this as an open risk.

- [ ] **Step 6: Commit nothing, report findings**

There is nothing to commit in this task. Report which checks passed, and for anything that failed, the exact console output.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: data model → 3; the 20 overlaps → 3 (data) and 8 step 4 (verification); two taxonomies → 3; the 12 groups → 3 and 6; the required bug fix → 2; the view, header, grouping, rows, filters, caveats → 6; compressed ladder and its four call sites → 4; settings UI → 5; error handling for missing metadata and constructed URLs → 3 and 6; stale "150" copy → 7; all six spec test cases → 1–4 as automated tests and 8 as manual checks; both spec risks → 8 steps 1 and 5.

**One deliberate deviation,** documented above: a third category, `"SQL"`, because the two SQL problems have no nearest NeetCode category.

**One item the spec listed that this plan does not change.** The spec notes `seedDemo` will now randomize over Roblox problems and calls it acceptable, since demo mode is disposable. No task touches it. That is intentional, not an omission.

**Type consistency.** `isRbx(id)` takes an id everywhere; `ladderFor(p)` and `offsetFor(p, num)` take a problem object. `RBX_INTERVALS` is the constant default and `rbxIntervals()` reads the live setting — Task 5 uses the constant only as an input fallback, matching how `DEFAULT_INTERVALS` is already used. Filter keys are `rbxQ`/`rbxDiff`/`rbxUnsolved`/`rbxOnsite`/`rbxSignal` in both Task 6's filter object and its view body. `ROBLOX_META` fields are `rcat`, `sources`, `signal`, `onsite`, `fp`, `fp2`, `fpVerified`, `conf`, `warn` in Tasks 3 and 6 alike.

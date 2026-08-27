# Roblox Interview Prep Section — Design

**Date:** 2026-08-27
**Target:** `index.html` (single-file app), `Code.gs` untouched
**Deadline this serves:** Roblox SWE Intern superday, **Sep 8, 2026** — 12 days out.
Loop order: Technical 2 (5:45p) → Technical 1 (6:30p) → Comm & Collab (7:15p).

## Purpose

Give the 98 problems from `roblox-dsa-master-list.md` a dedicated home in the tracker:
one organized surface that shows everything about the list — grouping, difficulty,
which sources reported each problem, how much to trust each link — while reusing the
tracker's existing solve/comfort/notes/review machinery rather than duplicating it.

The section is a **reference and checklist surface**, not a coaching engine. It does not
rank, prescribe daily assignments, or tell the user what to do next. It shows the list
neatly and records progress against it.

## Non-goals

- No study-plan generator or day-by-day allocation.
- No priority scoring that reorders the list for the user. `signal` is stored and
  displayed, and drives one optional filter, but never resorts the default view.
- No problem statements stored in-app. Links out to LeetCode and FastPrep.
- No changes to `Code.gs`, the Sheet's column layout, or the Apps Script deployment.

## Data model

### Split of responsibility

Roblox reference data is **immutable** — the master list is a fixed artifact. It is
hard-coded in `index.html`. The Sheet stores only mutable per-problem state, which the
existing 12 `P_HEADERS` columns already cover (`status`, `comfort`, `dateSolved`,
`notes`, `retired`).

This is what makes `Code.gs` untouchable: `initProblems` (index.html:1334) already
treats the seed as authoritative for static fields and pulls only mutable state from the
Sheet. Roblox problems ride that existing path.

### `ROBLOX_SEED` — the 78 new problems

Standard seed shape, `{id, name, cat, diff, blind, num, url}`. Ids **2001–2078**.
`blind` is always `false`. `num` is the LeetCode number where one exists, else `0`.
Appended to `state.problems` alongside `PROBLEMS_SEED`.

### `ROBLOX_META` — all 98, keyed by tracker problem id

Carries what the tracker has no field for:

| Field | Meaning |
|---|---|
| `rcat` | Roblox group (one of the 12 below) — what the new view groups by |
| `sources` | Verbatim source string, e.g. `"G15 · L · T"` |
| `signal` | Numeric: count of distinct sources + peak GitHub report count. Display + one filter only |
| `onsite` | Boolean — true for the 6 onsite-tagged entries |
| `fp` | FastPrep URL, or null |
| `fpVerified` | Boolean — false for the 27 constructed slugs, which may 404 |
| `conf` | Link confidence: `null` \| `"derived"` (`†`) \| `"unverified"` (`‡`) \| `"analogue"` (`~`) \| `"none"` (`—`) |
| `warn` | Per-problem caveat text, e.g. the Phone Battery Discharge `!` note |

### The 20 overlaps

These already exist in the tracker and are referenced by their **existing ids**. They
are added to `ROBLOX_META` only — never re-seeded, never duplicated. Their solve dates,
comfort ratings, and notes carry over untouched, and they appear in the Roblox view
already checked off.

| id | Problem | Current cat / diff |
|---|---|---|
| 3 | Two Sum | Arrays & Hashing / Easy |
| 9 | Longest Consecutive Sequence | Arrays & Hashing / Medium |
| 14 | Trapping Rain Water | Two Pointers / Hard |
| 16 | Longest Substring Without Repeating Characters | Sliding Window / Medium |
| 20 | Sliding Window Maximum | Sliding Window / Hard |
| 21 | Valid Parentheses | Stack / Easy |
| 27 | Largest Rectangle in Histogram | Stack / Hard |
| 47 | Maximum Depth of Binary Tree | Trees / Easy |
| 48 | Diameter of Binary Tree | Trees / Easy |
| 61 | Implement Trie (Prefix Tree) | Tries / Medium |
| 68 | Task Scheduler | Heap / Priority Queue / Medium |
| 84 | Rotting Oranges | Graphs / Medium |
| 87 | Course Schedule | Graphs / Medium |
| 88 | Course Schedule II | Graphs / Medium |
| 97 | Alien Dictionary | Advanced Graphs / Hard |
| 131 | Merge Intervals | Intervals / Medium |
| 132 | Non-overlapping Intervals | Intervals / Medium |
| 134 | Meeting Rooms II | Intervals / Medium |
| 136 | Rotate Image | Math & Geometry / Medium |
| 137 | Spiral Matrix | Math & Geometry / Medium |

`isRbx(id)` is the single predicate for "is this a Roblox problem" — a lookup in
`ROBLOX_META`. Everything else derives from it.

### Two taxonomies, one job each

- **`cat`** — the tracker's taxonomy. Keeps Index and Record coherent. The 78 new
  problems map to the nearest existing NeetCode category, with two additions to
  `CAT_ORDER`: **`"Matrix / Grid"`** and **`"Design / OOP"`**. Both are absent from
  NeetCode's 18 and are Roblox's two signature areas, so they earn their place rather
  than being forced into "Math & Geometry."
- **`rcat`** — the master list's own 12 groups. Used only by the Roblox view.

The 20 overlaps keep their existing `cat` and gain an `rcat`.

### The 12 groups, in list order

Matrix / Grid Simulation (17) · Arrays / Intervals / Two Pointers (21) · Strings (15) ·
Design / OOP (13) · Sliding Window (7) · Hash Table / Counting / Logs (7) ·
Heap / Scheduling (4) · Graphs / Topological Sort (3) · Trees (4) · DP / Bitmask (2) ·
Math / Misc (3) · SQL (2). Total 98.

## Bug fix required first

`initProblems` (index.html:1343) rehydrates user-added problems with:

```js
if(seed) Object.values(seed).forEach(s=>{ if(s.id>=1001) custom.push({...}) });
```

Roblox ids 2001–2078 satisfy `>= 1001`. On the second load — once those ids exist in the
Sheet — every Roblox problem is added twice: once from `ROBLOX_SEED`, once as "custom."
The user sees 98 duplicated rows after a refresh.

**Fix:** build a `Set` of all seed ids (`PROBLEMS_SEED` + `ROBLOX_SEED`) and skip any
Sheet row whose id is in it. Additionally confine `customSeq` to the **1001–1999** band
so hand-added problems never drift into the Roblox range.

This fix is a precondition, not an enhancement — the feature is broken on second load
without it.

## The view

Fifth nav tab, `data-v="roblox"`, labelled **05 Roblox**. Registered in `RENDERERS`
alongside the existing four; `renderView`/`switchView` need no structural change.

**Header strip.** Days until Sep 8 (recomputed live, floors at 0 and switches to a
past-tense label after the date). Coverage: solved / 98. The three loop times.

**Grouped list.** All 98 in the 12 groups above, in list order, each group headed with
its own solved/total. Rows use the existing `.tbl` table styling from `viewIndex` so the
section reads as part of the app rather than bolted on.

Row columns: checkbox (`toggleSolve`) · name · difficulty · `sources` · onsite marker ·
LeetCode link · FastPrep link where present · confidence mark · comfort dots ·
next review. Clicking a row calls the existing **`openProblem(id)`** — same detail
modal, same notes textarea, same comfort control, same solve-date field. Zero new
editing surface.

**Filters.** Same `.filters` bar pattern as `viewIndex`: search, Easy/Med/Hard chips,
Unsolved chip, plus **"Onsite only"** (6 entries) and **"3+ sources"** (the 8
cross-corroborated entries). Filter state lives in the existing `filters` object under
distinct keys (`rbxOnsite`, `rbxSignal`) so it can't collide with Index's filters.

**Caveats block** at the bottom, kept verbatim rather than paraphrased: the FastPrep
reliability warning, the meaning of each confidence mark, the stage caveat, and the
cross-source top 8. These are the parts that tell the user which entries to trust, so
summarizing them away would defeat the purpose.

## Compressed review ladder

Roblox problems use **`[1, 2, 4, 7]`** instead of the global `[1, 3, 7, 14, 30, 60]`.
At 12 days out this yields three or four touches before Sep 8 rather than one or two.

Stored as `state.settings.rbxIntervals`. Settings persist as a single JSON blob
(`writeSettings` stringifies the whole object), so this is a free addition — no columns,
no `Code.gs` change.

New helper: **`ladderFor(p)`** → `isRbx(p.id) ? state.settings.rbxIntervals :
state.settings.intervals`.

Four call sites currently hard-wire `intervals()` and must route through `ladderFor`:

| Function | Line | Why |
|---|---|---|
| `genReviews` | 595 | Generates the ladder on solve — the main path |
| `reactivateProblem` | 641 | Re-dates retired reviews |
| `applySolveDate` | 650 | Re-dates when the solve date is corrected |
| `openSettings` / `saveIntervals` | 1206 / 1236 | Config UI, currently fixed at 6 inputs |

`boot` restores only `intervals` and `goal` from the Sheet; it gains a guarded restore
for `rbxIntervals` (length 4, positive integers) falling back to the default.

Settings modal gains a second row of 4 inputs, labelled as the Roblox ladder, beside the
existing 6. `saveIntervals` writes both. `resetIntervals` resets both.

Both ladders feed the same Today queue, which is already capped at `CONFIG.QUEUE_CAP`
(10), so the added volume cannot flood the daily view.

## Error handling

- **Missing metadata.** `isRbx` returning false is always safe: the problem behaves as
  an ordinary tracker problem. A Roblox problem with no `ROBLOX_META` entry degrades to
  the global ladder and is absent from the Roblox view — no crash.
- **Sheet unreachable.** Unchanged. `boot`'s catch path calls `initProblems(null)`, which
  now seeds all 228 problems (150 + 78, plus the 20 tagged in place) with clean state.
- **Constructed FastPrep URLs.** 27 of 42 slugs are guessed and roughly a third are
  expected to 404. These render visually distinct from verified ones (`fpVerified:
  false`) so a dead link reads as expected, not broken.
- **Stale demo data.** `seedDemo` randomizes over `state.problems`. It will now touch
  Roblox problems too. Acceptable — demo mode is explicitly disposable — but the demo
  banner copy referencing "a blank 150" needs updating to reflect the new total.
- **`resetAllData`.** Its confirm copy also says "blank 150" and must be corrected, or
  the user is told the wrong thing before an irreversible wipe.

## Testing

The app has no test harness, so verification is manual against the real Sheet in
read-then-verify order:

1. **Load, then reload.** Confirm 228 problems, not 306. This is the duplication bug —
   it only appears on the *second* load, after ids 2001+ have been written to the Sheet.
2. **Overlap integrity.** Pick a solved overlap (e.g. Task Scheduler, id 68). Confirm it
   shows in the Roblox view with its original solve date, comfort, and notes intact, and
   that its existing 6-interval review chain was not regenerated or rewritten.
3. **Ladder routing.** Solve a new Roblox problem; confirm 4 reviews at +1/+2/+4/+7.
   Solve a NeetCode problem; confirm 6 reviews on the old ladder. Solve an overlap;
   confirm it takes the Roblox ladder (it is a Roblox problem by `isRbx`).
4. **Settings round-trip.** Edit both ladders, save, hard reload, confirm both persisted.
5. **Filter isolation.** Set filters in the Roblox view, switch to Index, confirm Index's
   filters are unaffected.
6. **Count check.** The 12 group totals sum to 98, and every `ROBLOX_META` id resolves to
   a real problem in `state.problems`.

Before touching the Sheet at all, the Roblox additions should be verified in demo mode
(`SCRIPT_URL` blanked locally) so a data mistake can't reach real progress.

## Risks

- **Writing to the live Sheet.** First load after this change writes 78 new rows. The
  standing rule for experimental work is read-never-write; this feature necessarily
  writes, so it should be verified in demo mode first and the Sheet duplicated as a
  backup before the first real load.
- **228 problems changes the Record view's math.** The goal target defaults to 150 and
  the pace stats divide by pool size. Roblox problems will shift those numbers. Worth
  checking `paceStats` and the colophon read sensibly, though no change is planned.

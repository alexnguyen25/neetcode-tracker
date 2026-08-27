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

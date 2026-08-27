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
  assert.equal(dupes.length, 0, `duplicated ids: ${dupes}`);
  assert.equal(ids.filter((id) => id === 2001).length, 1);
});

test("hand-added problems above 1000 still load", () => {
  const app = loadApp();
  app.initProblems(sheetRows([1005]));
  assert.ok(app.state.problems.some((p) => p.id === 1005), "1005 must survive");
});

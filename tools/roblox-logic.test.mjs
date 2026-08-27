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

test("ladderFor gives Roblox problems the compressed ladder", () => {
  const app = loadApp();
  app.initProblems(null);
  assert.deepEqual([...app.ladderFor(app.probById(2001))], [1, 2, 4, 7]);
  assert.deepEqual([...app.ladderFor(app.probById(68))], [1, 2, 4, 7], "overlap is Roblox");
  assert.deepEqual([...app.ladderFor(app.probById(1))], [1, 3, 7, 14, 30, 60]);
});

test("solving a Roblox problem generates exactly 4 reviews", () => {
  const app = loadApp();
  app.initProblems(null);
  const p = app.probById(2001);
  p.dateSolved = "2026-08-27";
  app.genReviews(p);
  const due = app.state.reviews.filter((r) => r.problemId === 2001).map((r) => r.due);
  assert.deepEqual([...due], ["2026-08-28", "2026-08-29", "2026-08-31", "2026-09-03"]);
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

test("id 1999 at band boundary does not cause collision on reload", () => {
  const app = loadApp();
  app.initProblems(null);
  // First reload: set up a Sheet with problem at band boundary
  const sheet = sheetRows([1999]);
  app.state.problems = [];
  app.initProblems(sheet);
  const probs1 = app.state.problems.filter(p => p.id >= 1001 && p.id < 2000).map(p => p.id);
  // Second reload: same Sheet, should not create duplicates
  app.state.problems = [];
  app.initProblems(sheet);
  const probs2 = app.state.problems.filter(p => p.id >= 1001 && p.id < 2000).map(p => p.id);
  // Both reloads should have exactly the same custom problems (no collision drift)
  assert.deepEqual([...probs1], [1999], "first reload must have exactly 1999");
  assert.deepEqual([...probs2], [1999], "second reload must have exactly 1999 (no collision)");
});

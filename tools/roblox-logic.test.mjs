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

test("band not exhausted: with custom ids 1001 and 1005, nextCustomId is 1006", () => {
  const app = loadApp();
  const sheet = sheetRows([1001, 1005]);
  app.initProblems(sheet);
  const next = app.nextCustomId();
  assert.equal(next, 1006, "should be max+1 when band has gaps");
});

test("exhaustion reclaims gaps: with band full except 1500, nextCustomId is 1500", () => {
  const app = loadApp();
  // Create a sheet with all ids from 1001-1999 except 1500
  const ids = [];
  for (let i = 1001; i <= 1999; i++) {
    if (i !== 1500) ids.push(i);
  }
  const sheet = sheetRows(ids);
  app.initProblems(sheet);
  const next = app.nextCustomId();
  assert.equal(next, 1500, "should reclaim the lowest gap when band is exhausted at top");
});

test("band completely full: all ids 1001-1999 present, nextCustomId returns null", () => {
  const app = loadApp();
  // Create a sheet with all ids from 1001-1999
  const ids = [];
  for (let i = 1001; i <= 1999; i++) {
    ids.push(i);
  }
  const sheet = sheetRows(ids);
  app.initProblems(sheet);
  const next = app.nextCustomId();
  assert.equal(next, null, "should return null when band is genuinely full");
});

test("no duplicate across reload: minting at exhaustion does not repeat on reload", () => {
  const app = loadApp();
  app.initProblems(null);
  // Fill band to 1999
  const ids = [];
  for (let i = 1001; i <= 1999; i++) {
    ids.push(i);
  }
  let sheet = sheetRows(ids);
  app.state.problems = [];
  app.initProblems(sheet);
  // At this point, nextCustomId should return null (band full)
  // But manually add a problem to test reload behavior
  const problemAt1001 = app.state.problems.find(p => p.id === 1001);
  if (problemAt1001) {
    // Remove one to create a gap for minting
    app.state.problems = app.state.problems.filter(p => p.id !== 1001);
    sheet = sheetRows(ids.filter(id => id !== 1001)); // Now 1001 is missing
    app.state.problems = [];
    app.initProblems(sheet);
    const first = app.nextCustomId();
    // Simulate adding this problem and reloading
    sheet[first] = { id: first, name: "test", cat: "Arrays & Hashing", diff: "Medium",
      blind: false, num: 0, url: "", status: "Todo", comfort: 0,
      dateSolved: null, notes: "", retired: false };
    // Reload with the minted id in the sheet
    app.state.problems = [];
    app.initProblems(sheet);
    const second = app.nextCustomId();
    assert.notEqual(first, second, "second mint must not duplicate the first");
  }
});

test("rbxSolvedCount counts only solved Roblox problems", () => {
  const app = loadApp();
  app.initProblems(null);
  assert.equal(app.rbxSolvedCount(), 0);
  app.probById(2001).status = "Solved";
  app.probById(68).status = "Solved";   // an overlap counts too
  app.probById(1).status = "Solved";    // a NeetCode-only problem does not
  assert.equal(app.rbxSolvedCount(), 2);
});

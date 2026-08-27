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

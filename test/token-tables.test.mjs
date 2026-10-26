import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTables } from "../scripts/token-tables.mjs";

const table = (types, ...rows) => ({ token_types: types, tokens: Uint32Array.from(rows.flat()) });
const types = ["identifier", "parameter", "function"];

test("identical tables are the same", () => {
  assert.ok(sameTables(table(types, [0, 0, 1]), table(types, [0, 0, 1])));
});

test("a token the reference calls an identifier may be a parameter", () => {
  assert.ok(sameTables(table(types, [1, 0, 1]), table(types, [0, 0, 1])));
});

test("any other change of kind is a difference", () => {
  assert.ok(!sameTables(table(types, [2, 0, 1]), table(types, [0, 0, 1])));
  assert.ok(!sameTables(table(types, [0, 0, 1]), table(types, [1, 0, 1])));
});

test("a change of range or of the type list is a difference", () => {
  assert.ok(!sameTables(table(types, [0, 0, 2]), table(types, [0, 0, 1])));
  assert.ok(!sameTables(table(types, [0, 0, 1], [0, 1, 2]), table(types, [0, 0, 1])));
  assert.ok(!sameTables(table([...types, "x"], [0, 0, 1]), table(types, [0, 0, 1])));
});

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

const kinds = [...types, "type"];

test("a function name directly after the type keyword may be a type", () => {
  const actual = table(kinds, [3, 5, 9]), expected = table(kinds, [2, 5, 9]);
  assert.ok(sameTables(actual, expected, "type Pass = () => void"));
});

test("a function that becomes a type anywhere else is a difference", () => {
  const actual = table(kinds, [3, 6, 10]), expected = table(kinds, [2, 6, 10]);
  assert.ok(!sameTables(actual, expected, "const Pass = () => void"));
  assert.ok(!sameTables(actual, expected));
});

const wide = ["identifier", "parameter", "function", "type", "property", "keyword"];
const change = (source, name, from, to) => {
  const start = source.indexOf(name), end = start + name.length;
  return [table(wide, [wide.indexOf(to), start, end]), table(wide, [wide.indexOf(from), start, end]), source];
};

test("the name at the start of a member may become a property", () => {
  for (const [source, name, from] of [
    ["interface A {\n  start: number\n  end: number\n}", "end", "type"],
    ["interface B {\n  readonly end: number\n}", "end", "type"],
    ["class C {\n  @Input() name: string\n}", "name", "identifier"],
    ["class D { x = 1; y = 2 }", "y", "identifier"],
  ]) assert.ok(sameTables(...change(source, name, from, "property")), source);
});

test("a name inside an expression may not become a property", () => {
  assert.ok(!sameTables(...change("const x = foo + end;", "end", "identifier", "property")));
  assert.ok(!sameTables(...change("call(end, other)", "end", "type", "property")));
});

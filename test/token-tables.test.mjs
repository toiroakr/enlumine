import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTables } from "../scripts/token-tables.mjs";

const table = (types, ...rows) => ({ token_types: types, tokens: Uint32Array.from(rows.flat()) });
const types = ["identifier", "parameter", "function"];

test("identical tables are the same", () => {
  assert.ok(sameTables(table(types, [0, 0, 1]), table(types, [0, 0, 1])));
});

test("a token the reference calls an identifier may be a parameter inside a parameter list", () => {
  assert.ok(sameTables(table(types, [1, 11, 12]), table(types, [0, 11, 12]), "function f(a) {}"));
  assert.ok(sameTables(table(types, [1, 0, 1]), table(types, [0, 0, 1]), "a => a"));
});

test("an identifier operand of an expression is not allowed to become a parameter", () => {
  assert.ok(!sameTables(table(types, [1, 8, 9]), table(types, [0, 8, 9]), "x = a + b;"));
});

test("any other change of kind is a difference", () => {
  assert.ok(!sameTables(table(types, [2, 0, 1]), table(types, [0, 0, 1])));
  assert.ok(!sameTables(table(types, [0, 2, 3]), table(types, [1, 2, 3]), "f(a)"));
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

const moves = (names, from, to, source, text) => {
  const start = source.indexOf(text), range = [start, start + text.length];
  return sameTables(table(names, [names.indexOf(to), ...range]), table(names, [names.indexOf(from), ...range]), source);
};

test("a type annotation is not allowed to become a parameter, a parameter of an arrow function is", () => {
  const names = ["type", "parameter"];
  assert.ok(moves(names, "type", "parameter", "const f = (Foo) => 1;", "Foo"));
  assert.ok(!moves(names, "type", "parameter", "let x: Foo = 1;", "Foo"));
  assert.ok(!moves(names, "type", "parameter", "f(Foo);", "Foo"));
});

test("a member kind is allowed only at a member start inside a class, interface or type literal", () => {
  const names = ["identifier", "property"];
  assert.ok(moves(names, "identifier", "property", "class A {\n  b = 1;\n}", "b"));
  assert.ok(moves(names, "identifier", "property", "type T = {\n  b: 1;\n};", "b"));
  assert.ok(!moves(names, "identifier", "property", "a;\nb = 1;", "b"));
  assert.ok(!moves(names, "identifier", "property", "if (a) {\n  b = 1;\n}", "b"));
});

test("a contextual keyword is allowed to become a name only where it is used as one", () => {
  const names = ["keyword", "identifier"];
  assert.ok(moves(names, "keyword", "identifier", "const get = 1;", "get"));
  assert.ok(moves(names, "keyword", "identifier", "x = { type: 1 };", "type"));
  assert.ok(!moves(names, "keyword", "identifier", "type Foo = string;", "type"));
  assert.ok(!moves(names, "keyword", "identifier", "import x from 'm';", "from"));
});

test("an object literal key is not allowed to become a label, a statement in a block is", () => {
  const names = ["identifier", "label"];
  assert.ok(moves(names, "identifier", "label", "function f() {\n  foo: for (;;) {}\n}", "foo"));
  assert.ok(!moves(names, "identifier", "label", "x = { foo: 1 };", "foo"));
  assert.ok(!moves(names, "identifier", "label", "f({ foo: 1 });", "foo"));
});

test("a name in an unfinished call is not a parameter, a name in an unfinished function head is", () => {
  const names = ["identifier", "parameter"];
  assert.ok(moves(names, "identifier", "parameter", "function f(a, x", "x"));
  assert.ok(!moves(names, "identifier", "parameter", "f(x", "x"));
  assert.ok(!moves(names, "identifier", "parameter", "f(x)", "x"));
});

test("a contextual keyword that is an object key is not allowed to become a label", () => {
  const names = ["keyword", "label"];
  assert.ok(moves(names, "keyword", "label", "function f() {\n  type: for (;;) {}\n}", "type"));
  assert.ok(!moves(names, "keyword", "label", "x = { type: 1 };", "type"));
});

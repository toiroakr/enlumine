import { test } from "node:test";
import assert from "node:assert/strict";
import runtime from "../packages/typescript/dist/index.js";

const named = kind => source => {
  const { tokens, token_types } = runtime(source);
  const found = [];
  for (let i = 0; i < tokens.length; i += 3)
    if (token_types[tokens[i]] === kind) found.push(source.slice(tokens[i + 1], tokens[i + 2]));
  return found;
};
const parameters = named("parameter");

const cases = (title, expected) =>
  test(title, () => {
    for (const [source, names] of expected) assert.deepEqual(parameters(source), names, source);
  });

cases("arrow functions with a return type annotation name their parameters", [
  ["const f = (a: T): R => a;", ["a"]],
  ["const f = (a: number, b = 1): number => a + b;", ["a", "b"]],
  ["const f = async <T,>(a: T): Promise<T> => a;", ["a"]],
  ["const f = <T extends object>(a: T): T => a;", ["a"]],
  ["const o = { m: (a: T): R => a };", ["a"]],
  ["class A { h = (e: Event): void => {}; }", ["e"]],
  ["xs.map((x: number): number => x * 2);", ["x"]],
]);

cases("function types after an annotation colon name their parameters", [
  ["interface I { n: (b: string) => void }", ["b"]],
  ["class A { n: (b: string, c?: number) => void; }", ["b", "c"]],
  ["const f: (a: number) => void = g;", ["a"]],
  ["declare function f(cb: (err: Error) => void): void;", ["cb", "err"]],
  ["interface I { m(a: number): void; n: (b: string) => void }", ["a", "b"]],
]);

cases("parenthesized expressions and types are not parameters", [
  ["x = cond ? (a + b) : c;", []],
  ["const x: (string | number)[] = y;", []],
  ["type A = { a: (string | number)[] };", []],
  ["const t = (a as T);", []],
  ["x = c ? (b): d => e;", ["d"]],
]);

cases("calls in a ternary branch are not parameters", [
  ["x = c ? g(a): b => d;", ["b"]],
  ["x = c ? o.m(a): b => d;", ["b"]],
  ["x = c ? new F(a): b => d;", ["b"]],
  ["x = c ? arr[0](a): b => d;", ["b"]],
]);

cases("the tag of a tagged template is never a parameter", [
  ["f = (html`<b></b>`): R => x;", []],
  ["f = (css`.a { color: red }`, b): R => x;", ["b"]],
]);

cases("the original detection takes precedence over the return-type form", [
  ["f = ((a) => b, c): R => d;", ["a"]],
]);

cases("a name followed by an angle bracket is not a parameter", [
  ["x = (a<b>): R => c;", []],
]);

cases("existing parameter detection is unchanged", [
  ["const f = (a: number, b = 1) => a + b;", ["a", "b"]],
  ["function f(this: W, a?: number, ...rest: string[]) {}", ["a", "rest"]],
  ["class A { constructor(private a: string, public readonly b = 1) {} }", ["a", "b"]],
  ["xs.map(x => x * 2);", ["x"]],
]);

const kindOf = (source, name) => {
  const { tokens, token_types } = runtime(source);
  for (let i = 0; i < tokens.length; i += 3) if (source.slice(tokens[i + 1], tokens[i + 2]) === name) return token_types[tokens[i]];
  return undefined;
};

const classes = (title, expected) =>
  test(title, () => {
    for (const [source, name, kind] of expected) assert.equal(kindOf(source, name), kind, `${name} in ${source}`);
  });

classes("the name of a function-type alias is a type, not a function", [
  ["type Tokenizer = (source: string) => Tokens;", "Tokenizer", "type"],
  ["type Pass = <T>(source: T) => void;", "Pass", "type"],
  ["export type Language = (source: string) => PackedTokens;", "Language", "type"],
]);

classes("a function bound to a variable is still a function", [
  ["const tokenize = (source: string) => source;", "tokenize", "function"],
  ["let run = async (x) => x;", "run", "function"],
  ["var f = function () {};", "f", "function"],
]);

const members = (source, kind) => {
  const { tokens, token_types } = runtime(source);
  const found = [];
  for (let i = 0; i < tokens.length; i += 3)
    if (token_types[tokens[i]] === kind) found.push(source.slice(tokens[i + 1], tokens[i + 2]));
  return found;
};

test("every member of a semicolon-free interface is a property", () => {
  assert.deepEqual(members("interface A {\n  start: number\n  end: number\n  name: string\n}", "property"), ["start", "end", "name"]);
  assert.deepEqual(members("type A = {\n  start: number\n  end: number\n}", "property"), ["start", "end"]);
  assert.deepEqual(members("interface B {\n  readonly id: string\n  name?: string\n  tags: string[]\n  next: Foo | null\n}", "property"), ["id", "name", "tags", "next"]);
});

test("methods of a semicolon-free interface are functions with parameters", () => {
  const source = "interface F {\n  a(x: number): void\n  b(y: string): void\n}";
  assert.deepEqual(members(source, "function"), ["a", "b"]);
  assert.deepEqual(members(source, "parameter"), ["x", "y"]);
});

test("a line that continues a type is not a new member", () => {
  assert.deepEqual(members("interface C {\n  kind: 'a'\n    | 'b'\n  other: number\n}", "property"), ["kind", "other"]);
  assert.deepEqual(members("interface D {\n  m: Array<\n    string\n  >\n  n: number\n}", "property"), ["m", "n"]);
  assert.deepEqual(members("interface E {\n  f: (a: number)\n    => void\n  g: number\n}", "property"), ["f", "g"]);
});

test("semicolon-separated and object-literal members are unchanged", () => {
  assert.deepEqual(members("interface E { a: number; b: string }", "property"), ["a", "b"]);
  assert.deepEqual(members("const o = {\n  a: 1,\n  b: 2\n}", "property"), ["a", "b"]);
});

test("fields of a class are properties", () => {
  assert.deepEqual(members("class A {\n  count: number = 1;\n  private name: string;\n  static x = 2;\n  readonly y?: Foo;\n  z!: Bar;\n}", "property"), ["count", "name", "x", "y", "z"]);
  assert.deepEqual(members("class C {\n  a: number\n  b: string\n  m() {}\n  c = 1\n  private d\n}", "property"), ["a", "b", "c", "d"]);
  assert.deepEqual(members("declare class P {\n  readonly keys: () => string[]\n  readonly values: () => string[]\n}", "property"), ["keys", "values"]);
});

test("fields behind a decorator are properties", () => {
  assert.deepEqual(members("class D {\n  @Input() name: string\n  @Output()\n  change = new Emitter()\n  @HostBinding('class.on') on = false\n}", "property"), ["name", "change", "on"]);
});

test("methods, accessors and arrow-function fields are not properties", () => {
  const source = "class B {\n  foo(): void {}\n  get g() { return 1 }\n  static async load(): Promise<void> {}\n  handler = () => {}\n  constructor(private a: string) {}\n}";
  assert.deepEqual(members(source, "property"), []);
  assert.deepEqual(members(source, "function"), ["foo", "g", "load", "handler", "constructor"]);
});

test("a ternary or an object literal in a field initializer does not make properties of its operands", () => {
  assert.deepEqual(members("class E { x = cond ? yes : no }", "property"), ["x"]);
  assert.deepEqual(members("class F { o = { a: 1, b: 2 }; m() { return { c: 3 } } }", "property"), ["o", "a", "b", "c"]);
});

const softKeywords = ["type", "from", "of", "as", "get", "set", "async", "static", "readonly", "declare", "abstract", "accessor", "override", "module", "namespace"];

const kindsOfName = (source, name) => {
  const { tokens, token_types } = runtime(source);
  const found = [];
  for (let i = 0; i < tokens.length; i += 3) if (source.slice(tokens[i + 1], tokens[i + 2]) === name) found.push(token_types[tokens[i]]);
  return found;
};

const asOrdinaryName = (title, templates) =>
  test(title, () => {
    for (const template of templates)
      for (const name of softKeywords) {
        const count = template.split("$").length - 1;
        const actual = kindsOfName(template.replaceAll("$", name), name).slice(-count), expected = kindsOfName(template.replaceAll("$", "zzz"), "zzz");
        assert.deepEqual(actual, expected, `${name} in ${template}`);
      }
  });

asOrdinaryName("a soft keyword used as a name is classified like any other name", [
  "function f($: number, other: string) {}",
  "const f = ($: number): number => $;",
  "const $ = 1; $ + 1;",
  "let $ = 1, other = 2; $ = 3;",
  "if ($ !== 1) {}",
  "x = $ ? 1 : 2;",
  "f($, 1);",
  "const o = { $: 1 };",
  "interface I {\n  a: number\n  $: string\n}",
  "interface I { readonly $: string }",
  "type T = { $: string };",
  "class A { $: number; other = 1 }",
  "class A {\n  $ = 1\n  other = 2\n}",
  "function $<T>(a: T) {}",
  "class A { $(): void {} }",
]);

test("a soft keyword keeps its meaning as a keyword", () => {
  assert.equal(kindOf("type Foo = string;", "type"), "keyword");
  assert.equal(kindOf("import { a } from 'x';", "from"), "keyword");
  assert.equal(kindOf("for (const x of xs) {}", "of"), "keyword");
  assert.equal(kindOf("const y = x as Foo;", "as"), "keyword");
  assert.equal(kindOf("class A { static m() {} }", "static"), "keyword");
  assert.equal(kindOf("class A { get g() { return 1 } }", "get"), "keyword");
  assert.equal(kindOf("class A { readonly x = 1 }", "readonly"), "keyword");
  assert.equal(kindOf("declare const x: number;", "declare"), "keyword");
  assert.equal(kindOf("namespace N { }", "namespace"), "keyword");
  assert.equal(kindOf("const f = async <T,>(a: T) => a;", "async"), "keyword");
});

test("a soft keyword as a variable name does not turn its initializer into a type", () => {
  assert.equal(kindOf("const type = c[i + 1];", "c"), "identifier");
  assert.equal(kindOf("const from = r.tokens[i];", "r"), "identifier");
  assert.equal(kindOf("type A = B;\nconst x = type;", "B"), "type");
});

test("readonly before a parenthesized type stays a keyword", () => {
  assert.equal(kindOf("let s: readonly (string | null)[];", "readonly"), "keyword");
});

test("the operand of typeof in a type is a value name, not a type", () => {
  assert.equal(kindOf("type T = ReturnType<typeof prepare>;", "prepare"), "identifier");
  assert.equal(kindOf("let v: typeof value;", "value"), "identifier");
  for (const name of ["a", "b", "c"]) assert.equal(kindOf("let w: typeof a.b.c;", name), "identifier");
  assert.equal(kindOf("let x: typeof a | Foo;", "Foo"), "type");
  assert.equal(kindOf("export const f: typeof add = (map, a) => map;", "add"), "identifier");
  assert.equal(kindOf("type P = Pick<typeof import(\"x\"), Names>;", "Names"), "type");
  assert.deepEqual(parameters("const f = (a): typeof x => y;"), ["a"]);
});

test("an enum name is a class name and its members are constants", () => {
  const source = "enum E { A = 1, B, C = 'c' }";
  assert.equal(kindOf(source, "E"), "class_name");
  for (const name of ["A", "B", "C"]) assert.equal(kindOf(source, name), "constant");
  assert.equal(kindOf("const enum F { X }", "F"), "class_name");
  assert.equal(kindOf("declare enum G { Y }", "G"), "class_name");
  assert.deepEqual(kindsOfName("enum H { A = 1, B = A | 2 }", "A"), ["constant", "identifier"]);
  assert.equal(kindOf("const e = E.A;", "E"), "identifier");
});

test("names bound by a destructured parameter are parameters", () => {
  assert.deepEqual(parameters("function f({ a, b }: P) {}"), ["a", "b"]);
  assert.deepEqual(parameters("function f([c, d]: Q) {}"), ["c", "d"]);
  assert.deepEqual(parameters("function f({ a = 1, b: renamed, ...rest }) {}"), ["a", "renamed", "rest"]);
  assert.deepEqual(parameters("const f = ({ a, b }: P): R => a;"), ["a", "b"]);
  assert.deepEqual(parameters("function f({ a: { b, c } }: P) {}"), ["b", "c"]);
  assert.deepEqual(parameters("function f({ a = other }) {}"), ["a"]);
  assert.deepEqual(parameters("function f(opts: { a: number, b: string }) {}"), ["opts"]);
});

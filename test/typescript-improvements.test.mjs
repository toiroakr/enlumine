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

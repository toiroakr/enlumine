import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "@twinkleplop/core";
import { execute } from "../packages/core/dist/index.js";
import { removePatternSeals } from "../scripts/grammar-seals.mjs";
import { packGrammar } from "../scripts/pack-grammar.mjs";

for (const language of ["json", "typescript", "graphql"]) {
  test(`${language}: packed tables shrink without changing adjacent token boundaries`, async () => {
    const { grammar } = await import(`@twinkleplop/${language}`);
    const original = structuredClone(grammar);
    const optimized = removePatternSeals(grammar);
    assert.ok(JSON.stringify(packGrammar(optimized)).length < JSON.stringify(packGrammar(grammar)).length);
    for (const source of ['"a""b"', "true+false null", "a ===!== b", 'query Q { f(a: "ΩΩ🌟") }', "1.e+-2", "/* x */-- y\n"]) {
      for (let end = 0; end <= source.length; end++) {
        const input = source.slice(0, end);
        assert.deepEqual(execute(input, optimized), execute(input, grammar), JSON.stringify(input));
      }
    }
    assert.deepEqual(grammar, original);
  });
}

test("mixed patterns and ASCII/Unicode single-character seals retain separate lexemes", () => {
  const grammar = compile({ states: { main: { rules: [
    { match: ["aa", "a"], token: "part", seal: true },
    { match: "é", token: "part", seal: true },
    { match: "bb", token: "part" },
  ] } } });
  const optimized = removePatternSeals(grammar);
  assert.deepEqual([...execute("aaaéébb", optimized).tokens], [0, 0, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 7]);
});

test("SQL hash comments keep a boundary after another comment", async () => {
  const { grammar } = await import("@twinkleplop/sql");
  const original = structuredClone(grammar);
  const optimized = removePatternSeals(grammar);
  assert.deepEqual([...execute("-- a\n# b\n", optimized).tokens], [0, 0, 5, 0, 5, 9]);
  assert.deepEqual(grammar, original);
});

test("fallback seals still separate Unicode after pattern seals are removed", () => {
  const grammar = compile({ states: { main: { rules: [
    { match: "aa", token: "part" },
    { any: true, token: "part", seal: true },
  ] } } });
  const rule = grammar.patterns_by_state[0][97][0].rule_idx;
  grammar.seal_flags.fill(0);
  grammar.seal_flags[rule] = 1;
  const optimized = removePatternSeals(grammar);
  assert.deepEqual([...execute("ééaa", optimized).tokens], [0, 0, 1, 0, 1, 2, 0, 2, 4]);
});

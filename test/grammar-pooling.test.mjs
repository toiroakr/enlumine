import { test } from "node:test";
import assert from "node:assert/strict";
import { brotliCompressSync } from "node:zlib";
import { build } from "esbuild";
import {packGrammar} from "../scripts/pack-grammar.mjs";
import { combineGrammars } from "../scripts/combine-grammars.mjs";
import {patternPrefix} from "../scripts/pattern-prefix.mjs";
import {execute} from "../packages/core/dist/index.js";

function encode(value) {
  return JSON.stringify(brotliCompressSync(Buffer.from(JSON.stringify(value))).toString("base64"));
}

test("pooled grammars preserve typed tables, maps, and independent mutable data", async () => {
  const grammar = packGrammar({
    transitions: new Uint16Array([0, 0, 65535]),
    probe_mask: new Uint8Array([1]),
    non_ascii_by_state: [new Int32Array([-1])],
    probe_fallbacks: new Map([[1, 2]]),
    nested: new Map([
      ["table", new Uint16Array([9, 9])],
      ["map", new Map([["name", ["value"]]])],
    ]),
    token_types: ["plain", "string"],
  });
  const source = `import {loadGrammar as read} from '@enlumine/core';
    export const first=read(${encode(grammar)});
    export const second=read(${encode(grammar)});
    export function shadow(read){return read("custom");}`;
  const transformed = combineGrammars(source);
  assert.equal((transformed.match(/enluminePooledLoad\(/g) ?? []).length, 1);
  const result = await build({stdin:{contents:transformed,resolveDir:new URL("../",import.meta.url).pathname},
    bundle:true,write:false,platform:"node",format:"esm",target:"node22"});
  const {first,second,shadow} = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  assert.deepEqual(first, second);
  assert.deepEqual(first.transitions, new Uint16Array([0, 0, 65535]));
  assert.deepEqual(first.probe_mask, new Uint8Array([1]));
  assert.deepEqual(first.non_ascii_by_state[0], new Int32Array([-1]));
  assert.deepEqual(first.probe_fallbacks, new Map([[1, 2]]));
  assert.deepEqual(first.nested, new Map([
    ["table", new Uint16Array([9, 9])],
    ["map", new Map([["name", ["value"]]])],
  ]));
  first.transitions[0] = 42;
  first.token_types[0] = "changed";
  first.probe_fallbacks.set(1, 3);
  first.nested.get("table")[0] = 42;
  first.nested.get("map").get("name")[0] = "changed";
  assert.equal(second.transitions[0], 0);
  assert.equal(second.token_types[0], "plain");
  assert.equal(second.probe_fallbacks.get(1), 2);
  assert.equal(second.nested.get("table")[0], 9);
  assert.deepEqual(second.nested.get("map").get("name"), ["value"]);
  assert.equal(shadow(value => value), "custom");
});

test("single grammars and unrelated loader names are left unchanged", () => {
  for (const source of [
    `import {loadGrammar} from '@enlumine/core';export const grammar=loadGrammar(${encode({})});`,
    `import {loadGrammar} from 'other';export const grammar=[loadGrammar("a"),loadGrammar("b")];`,
  ]) assert.equal(combineGrammars(source), source);
});

test("pooling grammar tables with prepared data preserves opaque values",async()=>{
  const {grammar}=await import("@twinkleplop/json");
  const data={patterns_by_state:[[[{codes:"meaningful"}]]],nested:{codes:[1,2,3]},enabled:true};
  assert.deepEqual(patternPrefix(data,"a"),data);
  const source=`import {loadGrammar as read} from '@enlumine/core';export const grammar=read(${encode(packGrammar(grammar))});export const data=read(${encode(data)});`;
  const result=await build({stdin:{contents:combineGrammars(source),resolveDir:new URL("../",import.meta.url).pathname},
    bundle:true,write:false,platform:"node",format:"esm",target:"node22"});
  const prepared=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  assert.deepEqual(prepared.data,data);
  for(const input of ['{"value":true,"other":null}', '"a\\u1234"',"false false_1 nullé", "1.e+-2"])
    assert.deepEqual(execute(input,prepared.grammar),execute(input,grammar));
});

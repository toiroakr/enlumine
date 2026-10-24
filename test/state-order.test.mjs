import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import ts from "typescript";
import {brotliCompressSync,brotliDecompressSync} from "node:zlib";
import {reorderStates,reorderRules} from "../scripts/grammar-order.mjs";
import {packGrammar} from "../scripts/pack-grammar.mjs";
import {compile} from "@twinkleplop/core";
import {execute,loadGrammar} from "../packages/core/dist/index.js";

const encode=value=>brotliCompressSync(Buffer.from(JSON.stringify(value))).toString("base64");
async function grammars(language) {
  if(language==="sql"||language==="json") {
    const {raw_grammar}=await import(`@twinkleplop/${language}`);
    const grammar=compile(raw_grammar);
    const fields=["transitions","char_maps","token_types","patterns_by_state","fallback_transitions","non_ascii_by_state",
      "probe_mask","probe_fallbacks","boundary_flags","run_kinds","has_seals","seal_flags","fallback_seal_flags"];
    return [packGrammar(Object.fromEntries(fields.map(field=>[field,grammar[field]])))];
  }
  const output=await build({entryPoints:[new URL(`../packages/${language}/dist/index.js`,import.meta.url).pathname],bundle:true,write:false,format:"esm",platform:"node"});
  const ast=ts.createSourceFile("bundle.js",output.outputFiles[0].text,ts.ScriptTarget.Latest,true);
  let value;
  function visit(node) {
    if (!value && ts.isStringLiteral(node) && node.text.length>500) {
      try { value=JSON.parse(brotliDecompressSync(Buffer.from(node.text,"base64"))); } catch {}
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  assert.ok(value,language);
  const tables=(Array.isArray(value)?value:[value]).filter(grammar=>grammar?.probe_mask?.$);
  assert.ok(tables.length,language);
  return tables;
}

for (const language of ["json","typescript","sql","graphql"]) {
  test(`${language}: grammar renumbering preserves document and named fragment entry points`,async()=>{
    const inputs=[
      "",String.fromCharCode(...Array.from({length:160},(_,i)=>i)),
      "alpha_1 23.4e-5\r\n", "/* a /* b */ c */", "-- x\n// y",
      '"hello\\nΩΩ🌟"', "'it''s fine'", '`x ${value}`',
      '$tag$body$tag$', '"""block\\"""string"""',
      "if (a < b) /x/.test(value);", "user(id: $id) { name }", String.fromCharCode(0xd800)+"🌟",
    ];
    for (const packed of await grammars(language)) {
      const beforeJson=JSON.stringify(packed);
      const before=loadGrammar(encode(packed));
      const count=before.probe_mask.length;
      const order=[0,...Array.from({length:count-1},(_,i)=>count-1-i)];
      const mappings=Array.from({length:count},()=>Array.from({length:256},(_,rule)=>rule===255?255:254-rule));
      const variants=[
        ["states",reorderStates(packed,order),state=>order.indexOf(state)],
        ["rules",reorderRules(packed,mappings),state=>state],
        ["both",reorderStates(reorderRules(packed,mappings),order),state=>order.indexOf(state)],
      ];
      assert.equal(JSON.stringify(packed),beforeJson);
      for (const [variant,grammar,remap] of variants) {
        const after=loadGrammar(encode(grammar));
        for (const state of new Set([0,...Object.values(before.entry_states??{})])) for(const source of inputs)
          assert.deepEqual(execute(source,after,remap(state)),execute(source,before,state),JSON.stringify({variant,state,source}));
        for (const [name,state] of Object.entries(before.entry_states??{}))
          assert.equal(after.entry_states[name],remap(state),name);
      }
      assert.throws(()=>reorderRules(packed,[]),/every state/);
      assert.throws(()=>reorderRules(packed,Array.from({length:count},()=>Array(256).fill(0))),/unique/);
      if (count>1) {
        const incomplete=order.slice();
        delete incomplete[1];
        assert.throws(()=>reorderStates(packed,incomplete),/every state/);
        assert.throws(()=>reorderStates(packed,order.toReversed()),/state zero/);
        assert.throws(()=>reorderStates(packed,Array(count).fill(0)),/every state/);
      }
    }
  });
}

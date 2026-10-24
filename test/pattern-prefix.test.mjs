import {test} from "node:test";
import assert from "node:assert/strict";
import {brotliCompressSync} from "node:zlib";
import {execute,loadGrammar} from "../packages/core/dist/index.js";
import {packGrammar} from "../scripts/pack-grammar.mjs";
import {patternPrefix} from "../scripts/pattern-prefix.mjs";

const load=value=>loadGrammar(brotliCompressSync(Buffer.from(JSON.stringify(value))).toString("base64"));

for(const language of ["json","typescript","sql","graphql"]) {
  test(`${language}: ignored pattern heads preserve boundaries, probes, and delimiters`,async()=>{
    const {grammar}=await import(`@twinkleplop/${language}`);
    const packed=packGrammar(grammar),snapshot=structuredClone(packed);
    const before=load(packed),after=load(patternPrefix(packed,"a"));
    for(const source of [
      "true false null undefined true_value null1", "a ===!== b?.x => x ?? 1",
      'query Q($id: ID!) { user(id:$id) { name } }',
      '"hello\\u1234\\nΩΩ🌟""next"', "'it''s fine'", '"""block\\"""body"""',
      "if (a) /x/.test(b); let f = <T>(x:T)=>x", "/* a /* b */ c */ -- x\n# y\n",
      "$tag$body$tag$ $$body$$ @name @@global 0x1e", "u&'x' e'\\u12'",
    ])for(let end=0;end<=source.length;end++) {
      const input=source.slice(0,end);
      assert.deepEqual(execute(input,after),execute(input,before),JSON.stringify(input));
    }
    assert.deepEqual(packed,snapshot);
  });
}

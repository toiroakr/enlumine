import { test } from "node:test";
import assert from "node:assert/strict";
import { execute } from "../packages/core/dist/index.js";
import { tokenize as upstreamExecute } from "@twinkleplop/core";

for(const language of ["json","typescript","sql","graphql"]) {
  test(`${language}: Unicode runs retain escapes, delimiters, and owned token ranges`,async()=>{
    const current=(await import(`../packages/${language}/dist/index.js`)).default;
    const reference=(await import(`@twinkleplop/${language}`)).tokenize();
    const body='ΩΩ🌟\u0085éΩ'.repeat(4096);
    const text=`a${body}b\\n${body}`;
    const source=language==="json"?`["${text}","tail"]`:language==="typescript"?`const text = "${text}"; /* ${body} */ next();`:language==="sql"?`SELECT '${text}', 42; /* ${body} */`: `query { field(arg: "${text}") } # ${body}\n`;
    const before=current(source),expected=reference(source);
    assert.deepEqual(before.tokens,expected.tokens);
    assert.deepEqual(before.token_types,expected.token_types);
    const copy=before.tokens.slice();
    current('"other"');
    assert.deepEqual(before.tokens,copy);
  });
}

test("Unicode fallback seals preserve every upstream token boundary",async()=>{
  const {grammar}=await import("@twinkleplop/json");
  const copy={...grammar,has_seals:true,fallback_seal_flags:new Uint8Array(grammar.probe_mask.length).fill(1)};
  const source='"aΩΩ🌟b\\nλΩΩ"';
  const expected=upstreamExecute(source,copy),actual=execute(source,copy);
  assert.deepEqual(actual.tokens,expected.tokens);
  assert.deepEqual(actual.token_types,expected.token_types);
});

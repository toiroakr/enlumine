import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {highlight,highlightLines} from "../packages/terminal/dist/index.js";
import {tokenizeLines as sqlLines} from "../packages/sql/dist/index.js";
import {tokenizeLines as graphqlLines} from "../packages/graphql/dist/lexical.js";
const highlightSqlLines=(lines,styles)=>highlightLines(lines,{tokenizeLines:sqlLines,styles});
const highlightGraphqlLines=(lines,styles)=>highlightLines(lines,{tokenizeLines:graphqlLines,styles});

test("renderers contain no theme data and importing dark includes no other theme",async()=>{
  for(const selected of [null,"dark","light","ansi"]) {
    const contents=selected
      ? `export {highlight} from './packages/terminal/dist/index.js';export {default as theme} from './packages/terminal/dist/themes/${selected}.js';`
      : `export {highlight,highlightLines} from './packages/terminal/dist/index.js';export {tokenizeLines as sqlLines} from './packages/sql/dist/index.js';export {tokenizeLines as graphqlLines} from './packages/graphql/dist/lexical.js';`;
    const result=await build({stdin:{contents,resolveDir:new URL("../",import.meta.url).pathname},bundle:true,write:false,metafile:true,platform:"node",format:"esm",minify:true});
    const themes=Object.keys(result.metafile.inputs).filter(path=>path.includes("/themes/"));
    assert.deepEqual(themes,selected?[`packages/terminal/dist/themes/${selected}.js`]:[]);
  }
});

test("generic rendering requires an explicit theme and honors an empty theme",()=>{
  assert.throws(()=>highlight("x",{tokenizer:null}),/theme/i);
  assert.equal(highlight("plain",{tokenizer:null,theme:{}}),"plain");
});

test("line tokenizers carry no ANSI codes and import no renderer",async()=>{
  for(const entry of ["sql/dist/index.js","graphql/dist/lexical.js"]) {
    const result=await build({stdin:{contents:`export {tokenizeLines} from './packages/${entry}';`,resolveDir:new URL("../",import.meta.url).pathname},bundle:true,write:false,metafile:true,platform:"node",format:"esm",minify:true});
    assert.ok(!result.outputFiles[0].text.includes("[0m"),entry);
    assert.ok(Object.keys(result.metafile.inputs).every(path=>!path.includes("/terminal/")),entry);
  }
});

test("line rendering uses the supplied styles without a fallback palette",()=>{
  const theme={sql:{keyword:"\x1b[31m"},graphql:{property:"\x1b[35m",string:"\x1b[36m"}};
  assert.ok(highlightSqlLines(["SELECT 1"],theme.sql)[0].includes("\x1b[31mSELECT\x1b[0m"));
  assert.equal(highlightGraphqlLines(['field(arg: "unfinished'],theme.graphql)[0],
    '\x1b[35mfield\x1b[0m(arg: \x1b[36m"unfinished\x1b[0m');
  const empty={sql:{},graphql:{}};
  assert.deepEqual(highlightSqlLines(["SELECT 1 -- note"],empty.sql),["SELECT 1 -- note"]);
  assert.deepEqual(highlightGraphqlLines(['field(arg: "unfinished'],empty.graphql),['field(arg: "unfinished']);
});

import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";
import {build} from "esbuild";
import ts from "typescript";
import {frame_track} from "@twinkleplop/core";
import {grammar} from "@twinkleplop/typescript";
import {execute,loadGrammar} from "../packages/core/dist/index.js";
import {frameAdapter,compileFrameSpecs,encodeFrameSpec,enlumineReviveFrame} from "../scripts/frame-specs.mjs";

const parse=source=>ts.createSourceFile("frame.js",source,ts.ScriptTarget.Latest,true);

test("frame preparation respects imported bindings and rejects indirect factory uses",()=>{
  const ast=parse('import {frame_track as track} from "@twinkleplop/core";const result=track(spec);function shadow(track){return track(other)}');
  const {calls}=frameAdapter(ast,"language");
  assert.equal(calls.length,1);
  assert.equal(calls[0].arguments[0].getText(ast),"spec");
  assert.throws(()=>frameAdapter(parse('import {frame_track as track} from "@twinkleplop/core";const alias=track;'),"language"),/indirect/);
  assert.deepEqual(frameAdapter(parse('import {frame_track as track} from "other";track(spec);'),"language").calls,[]);
  assert.throws(()=>frameAdapter(parse('function compile(spec){return spec}function track(spec){const value=compile(spec);return [value,spec]}export {track as frame_track};'),"@twinkleplop/core"),/raw spec/);
});

test("prepared frame membership data round-trips without mutating its source",()=>{
  const value={rearm_kind_ids:new Set([3]),optional_kind_ids:new Set([3,4]),brace_kinds:{prev_rules:[{in_kind_ids:new Set([4])}]}};
  const snapshot=structuredClone(value);
  assert.deepEqual(enlumineReviveFrame(loadGrammar(encodeFrameSpec(value))),value);
  assert.deepEqual(value,snapshot);
  assert.throws(()=>encodeFrameSpec({...value,unknown:new Set([1])}),/membership field/);
  assert.throws(()=>encodeFrameSpec({...value,unknown:undefined}),/Unsupported/);
  assert.throws(()=>encodeFrameSpec({...value,unknown:{$:[0,[]]}}),/Unsupported/);
});

test("prepared frame trackers preserve native scope, ternary, and statement signals",async()=>{
  const spec={
    punct_type:"punctuation",
    brackets:{paren:{open:"(",close:")"},brace:{open:"{",close:"}"},bracket:{open:"[",close:"]"}},
    brace_kinds:{body_markers:[{type:"keyword",text:"class",kind:"class"}],
      prev_rules:[{prev_type:"punctuation",prev_last_char_in:")",in_kinds:["class"],kind:"block"}],
      default_kind:"object",start_kind:"block"},
    at_start:{reset_chars:";{",transparent_types:["comment"],
      transparent_texts_for_type:[{type:"keyword",texts:["export","default"]}],rearm_after_close_kinds:["class"]},
    ternary:{qmark:{type:"operator",text:"?"},colon_char:":",optional_member_kinds:["class","object"]},
    stmt_flags:[{name:"var_decl",arm:{type:"keyword",texts:["let","const"]},
      clear:{type:"keyword",texts:["return"]},clear_chars:";",clear_on_brace_close:true}],
  };
  const snapshot=structuredClone(spec),[expression]=await compileFrameSpecs([spec]);
  assert.deepEqual(spec,snapshot);
  const argument=parse(expression).statements[0].expression.arguments[0].text;
  const compiled=loadGrammar(argument);
  assert.equal(compiled.brace_kinds.prev_rules.length,1);
  assert.equal(Object.hasOwn(compiled.brace_kinds.prev_rules[0],"in_kind_names"),false);
  assert.deepEqual(compiled.brace_kinds.prev_rules[0].in_kind_ids,[3]);
  const result=await build({
    stdin:{contents:`import {frame_track} from "@twinkleplop/core";import {loadGrammar as enlumineFrameSpecData} from "@enlumine/core";export default frame_track(${expression});`,resolveDir:fileURLToPath(new URL("../",import.meta.url))},
    bundle:true,write:false,format:"esm",platform:"node",target:"node22",minify:true,
    plugins:[{name:"prepared-frame-test",setup(builder){
      builder.onLoad({filter:/twinkleplop\.production\.js$/},async({path})=>{
        const source=await readFile(path,"utf8"),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
        let contents=source;
        for(const edit of frameAdapter(ast,"@twinkleplop/core").edits.toSorted((a,b)=>b.start-a.start))
          contents=contents.slice(0,edit.start)+edit.text+contents.slice(edit.end);
        return {contents,loader:"js",resolveDir:dirname(path)};
      });
    }}],
  });
  const prepared=(await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`)).default;
  const native=frame_track(spec);
  for(const source of ["", "export class X { fn(x) { return x ? y : z; } }", "const a = {x: 1, y: (a ? b : c)};", "class X { member?: Array<T>; }", "/* x */ let a: User = x; return a;", ") ] } ({ ΩΩ: [1] })"])
    for(let end=0;end<=source.length;end++) {
      const input=source.slice(0,end),packed=execute(input,grammar);
      assert.deepEqual(prepared(input,structuredClone(packed)),native(input,structuredClone(packed)),JSON.stringify(input));
    }
});

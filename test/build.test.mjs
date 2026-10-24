import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import ts from "typescript";
import { to_html } from "@twinkleplop/core";
import { tokenize } from "@twinkleplop/json";
import { isolateHtmlTables } from "../scripts/isolate-html-tables.mjs";
import { pureInitializers } from "../scripts/pure-initializers.mjs";

const result=await build({
  stdin:{contents:'export {to_html} from "@twinkleplop/core";',resolveDir:new URL("../",import.meta.url).pathname},
  bundle:true,write:false,format:"esm",platform:"node",target:"node22",minify:true,
  plugins:[{name:"isolate-html-tables",setup(build){
    build.onLoad({filter:/twinkleplop\.production\.js$/},async({path})=>{
      const source=await readFile(path,"utf8");
      const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
      const edit=isolateHtmlTables(ast);
      return{contents:source.slice(0,edit.start)+edit.text+source.slice(edit.end),loader:"js",resolveDir:new URL(".",`file://${path}`).pathname};
    });
  }}],
});
const transformed=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
const lexer=tokenize();
test("isolating unused HTML setup preserves upstream escaping, whitespace, and rendering options",()=>{
  for(const source of ['{"s":"<&>\\\"\'","n":42}',"  [1,2]\r\n\t[true,false,null]\n",'"ΩΩ 🌟"',"",'"<span> & \\n"']) {
    for(const options of [{},{structure:"inline"},{line_numbers:{start:3},whitespace:"all",indent_guides:true},{escape:{"&":"AND","<":"LT"},class_name:"custom"}]) {
      const packed=lexer(source);
      assert.equal(transformed.to_html(source,packed,options),to_html(source,packed,options));
    }
  }
});

async function compileGrammarArrays(source) {
  const {grammarArrays}=await import("../scripts/grammar-arrays.mjs");
  const ast=ts.createSourceFile("fixture.mjs",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const pure=grammarArrays(ast,new Set(["match"]));
  const edits=[];
  for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)
    if(pure.has(declaration.name.getText(ast)))edits.push({start:declaration.initializer.getStart(ast),end:declaration.initializer.end});
  let contents=source;
  for(const edit of edits.sort((a,b)=>b.start-a.start))contents=contents.slice(0,edit.start)+`/* @__PURE__ */(()=>(${contents.slice(edit.start,edit.end)}))()`+contents.slice(edit.end);
  const output=await build({stdin:{contents,resolveDir:new URL("../",import.meta.url).pathname},bundle:true,write:false,minify:true,format:"esm",platform:"node",target:"node22"});
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`);
}

test("unused grammar arrays still evaluate effectful constructor arguments",async()=>{
  const module=await compileGrammarArrays(`import {match} from "@twinkleplop/core";
    let observed=0; const base=[match("a")];
    const holder={get name(){observed++;return "b";}};
    const unused=[...base,match(holder.name)];
    export const calls=observed;`);
  assert.equal(module.calls,1);
});

test("unused grammar arrays preserve errors thrown by constructor arguments",async()=>{
  await assert.rejects(compileGrammarArrays(`import {match} from "@twinkleplop/core";
    const base=[match("a")];
    function fail(){throw new Error("argument evaluated");}
    const unused=[...base,match(fail())];
    export const result=true;`),/argument evaluated/);
});

async function compileInitializers(source) {
  const ast=ts.createSourceFile("fixture.mjs",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let contents=source;
  for(const edit of pureInitializers(ast).sort((a,b)=>b.start-a.start))
    contents=contents.slice(0,edit.start)+edit.text+contents.slice(edit.end);
  const result=await build({stdin:{contents},bundle:true,write:false,minify:true,format:"esm",platform:"node",target:"node22"});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

test("unused buffer arguments retain numeric conversion side effects and exceptions",async()=>{
  const result=await compileInitializers(`let calls=0; const value={valueOf(){calls++;return 3;}};
    const unused=new Int32Array(128*value); export const observed=calls;`);
  assert.equal(result.observed,1);
  await assert.rejects(compileInitializers(`const value={valueOf(){throw new Error("conversion");}};
    const unused=new Int32Array(128*value); export const observed=true;`),/conversion/);
});

test("reassigned allocation arguments and enumeration targets retain their effects",async()=>{
  const result=await compileInitializers(`let calls=0; let value=3;
    value={valueOf(){calls++;return 1;}}; const unused=new Int32Array(128*value);
    let table={name:"value"}; table=new Proxy(table,{ownKeys(target){calls++;return Reflect.ownKeys(target);}});
    const keys=Object.keys(table); export const observed=calls;`);
  assert.equal(result.observed,2);
});

test("unused constructors with additional effects still run",async()=>{
  const result=await compileInitializers(`let calls=0; const Buffer=class {
    constructor(e=1024){this.count=0;this.capacity=e;this.token_idx=new Int32Array(e);
      this.type_id=new Int32Array(e);this.precedence=new Int32Array(e);calls++;}
    emit(){} }; const unused=new Buffer(); export const observed=calls;`);
  assert.equal(result.observed,1);
});

test("unused invalid buffer sizes still throw allocation errors",async()=>{
  for(const length of ["1-2","1/0","2**100"])
    await assert.rejects(compileInitializers(`const unused=new Int32Array(${length});export const observed=true;`),RangeError);
});

import ts from "typescript";
import {compile} from "@twinkleplop/core";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {removePatternSeals} from "./grammar-seals.mjs";

const fields=["transitions","char_maps","token_types","patterns_by_state","fallback_transitions","non_ascii_by_state","probe_mask","probe_fallbacks","boundary_flags","run_kinds","has_seals","seal_flags","fallback_seal_flags"];

function table(grammar) {
  const result=removePatternSeals(Object.fromEntries(fields.map(field=>[field,grammar[field]])));
  for(const field of ["boundary_flags","seal_flags","fallback_seal_flags"])
    if(result[field]&&!result[field].some(Boolean))delete result[field];
  return result;
}

async function jsdocGrammar() {
  const path=fileURLToPath(import.meta.resolve("@twinkleplop/javascript"));
  const source=await readFile(path,"utf8");
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  let name;
  for(const statement of ast.statements)
    if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations) {
      const call=declaration.initializer;
      if(call&&ts.isCallExpression(call)&&call.arguments[0]&&ts.isObjectLiteralExpression(call.arguments[0])&&
          call.arguments[0].properties.some(property=>property.name?.getText(ast)==="name"&&
            ts.isPropertyAssignment(property)&&property.initializer.getText(ast)==='"jsdoc"'))name=declaration.name.getText(ast);
    }
  if(!name)throw new Error("Missing upstream jsdoc grammar");
  let rewritten=source;
  const edits=ast.statements.filter(ts.isImportDeclaration).map(node=>({start:node.moduleSpecifier.getStart(ast),end:node.moduleSpecifier.end,
    text:JSON.stringify(import.meta.resolve(node.moduleSpecifier.text))}));
  for(const edit of edits.toSorted((a,b)=>b.start-a.start))rewritten=rewritten.slice(0,edit.start)+edit.text+rewritten.slice(edit.end);
  rewritten+=`\nexport const enlumineJsdoc=${name};`;
  const module=await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`);
  return compile(module.enlumineJsdoc);
}

const pinned={
  core:"ea4ad1a0833303c6c11c1924c3f62b9bfcbdc7830f0aa97e8e73be5f154bbeaf",
  typescript:"56e9d6cbbd34d34abde7f8f39ddf77f4b2f4098c5852aeb4b0f35ef8e69b334c",
  javascript:"5ff33006ab9a1cda1fb230a78963f98c771afe98321be96d9fe74c89be3b4937",
  html:"d6333653b7512ea2d3913bb087ddf954c707c1a1fd06fcf79b6b12644662c103",
  css:"fb4085e7b71e5bbf58a2901d6304e5f615268d89bff9c0c36bae16a5d8cb182a",
};

async function signature(name) {
  const path=fileURLToPath(import.meta.resolve("@twinkleplop/"+name));
  const manifest=JSON.parse(await readFile(resolve(path,"../../package.json"),"utf8"));
  return {version:manifest.version,sha256:createHash("sha256").update(await readFile(path)).digest("hex")};
}

export async function typescriptTables() {
  const signatures=Object.fromEntries(await Promise.all(Object.keys(pinned).map(async name=>[name,await signature(name)])));
  for(const [name,expected] of Object.entries(pinned))
    if(signatures[name].sha256!==expected)
      throw new Error(`@twinkleplop/${name} changed; update the dedicated TypeScript reclassifiers (packages/typescript/src) and run compatibility checks`);
  const [typescript,javascript,html,css]=await Promise.all(["typescript","javascript","html","css"].map(async name=>(await import(`@twinkleplop/${name}`)).grammar));
  return {
    tables:{typescript:table(typescript),javascript:table(javascript),html:table(html),css:table(css),jsdoc:table(await jsdocGrammar())},
    metadata:{engine:"typescript-dedicated",upstream:signatures},
  };
}

import ts from "typescript";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {brotliCompressSync,constants} from "node:zlib";

let compilerPromise;

function checkerFor(ast) {
  const options={allowJs:true,noResolve:true,noLib:true};
  const host=ts.createCompilerHost(options);
  host.getSourceFile=file=>file===ast.fileName?ast:undefined;
  return ts.createProgram([ast.fileName],options,host).getTypeChecker();
}

function factory(ast) {
  let name;
  for(const statement of ast.statements)
    if(ts.isExportDeclaration(statement)&&statement.exportClause&&ts.isNamedExports(statement.exportClause))
      for(const item of statement.exportClause.elements)
        if(item.name.text==="frame_track")name=item.propertyName?.text??item.name.text;
  if(!name)return;
  const node=ast.statements.find(item=>ts.isFunctionDeclaration(item)&&item.name?.text===name);
  const declaration=node?.body?.statements[0]?.declarationList?.declarations[0];
  const parameter=node?.parameters[0]?.name;
  const initializer=declaration?.initializer;
  if(node?.parameters.length!==1||!parameter||!ts.isIdentifier(parameter)||!declaration||
      !ts.isIdentifier(declaration.name)||!initializer||!ts.isCallExpression(initializer)||
      !ts.isIdentifier(initializer.expression)||initializer.arguments.length!==1||
      initializer.arguments[0].getText(ast)!==parameter.text)
    throw new Error("Unsupported pinned frame tracker factory");
  const checker=checkerFor(ast),symbol=checker.getSymbolAtLocation(parameter);
  function visit(item) {
    if(ts.isIdentifier(item)&&checker.getSymbolAtLocation(item)===symbol&&item!==initializer.arguments[0])
      throw new Error("Frame tracker uses its raw spec after compilation");
    ts.forEachChild(item,visit);
  }
  visit(node.body);
  return {initializer,parameter:parameter.text,compiler:initializer.expression.text};
}

export function enlumineReviveFrame(value) {
  for(const key of ["rearm_kind_ids","optional_kind_ids"])
    if(value[key]!==null)value[key]=new Set(value[key]);
  if(value.brace_kinds!==null)
    for(const rule of value.brace_kinds.prev_rules)
      if(rule.in_kind_ids!==null)rule.in_kind_ids=new Set(rule.in_kind_ids);
  return value;
}

export function frameAdapter(ast,packageName) {
  if(packageName==="@twinkleplop/core") {
    const value=factory(ast);
    if(!value)return {calls:[],edits:[]};
    if(ast.text.includes("enlumineReviveFrame"))throw new Error("Frame helper binding collision");
    return {calls:[],edits:[
      {start:value.initializer.getStart(ast),end:value.initializer.end,text:`enlumineReviveFrame(${value.parameter})`},
      {start:0,end:0,text:enlumineReviveFrame.toString()+"\n"},
    ]};
  }
  const bindings=[];
  for(const statement of ast.statements)
    if(ts.isImportDeclaration(statement)&&statement.moduleSpecifier.text==="@twinkleplop/core") {
      const named=statement.importClause?.namedBindings;
      if(named&&ts.isNamedImports(named))for(const item of named.elements)
        if((item.propertyName?.text??item.name.text)==="frame_track")bindings.push(item.name);
    }
  if(!bindings.length)return {calls:[],edits:[]};
  const checker=checkerFor(ast),symbols=new Set(bindings.map(binding=>checker.getSymbolAtLocation(binding)));
  if(symbols.has(undefined))throw new Error("Unresolved frame tracker binding");
  const calls=[];
  function visit(node) {
    if(ts.isIdentifier(node)&&symbols.has(checker.getSymbolAtLocation(node))&&!ts.isImportSpecifier(node.parent)) {
      const call=node.parent;
      if(!ts.isCallExpression(call)||call.expression!==node||call.arguments.length!==1)
        throw new Error("Unsupported indirect frame tracker use");
      calls.push(call);
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  return {calls,edits:[]};
}

async function compiler() {
  if(!compilerPromise)compilerPromise=(async()=>{
    const path=fileURLToPath(import.meta.resolve("@twinkleplop/core"));
    const source=await readFile(path,"utf8"),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
    const value=factory(ast);
    if(!value)throw new Error("Missing native frame compiler");
    const edits=[];
    for(const statement of ast.statements)if(ts.isImportDeclaration(statement)) {
      const specifier=statement.moduleSpecifier.text;
      edits.push({start:statement.moduleSpecifier.getStart(ast),end:statement.moduleSpecifier.end,
        text:JSON.stringify(specifier.startsWith(".")?pathToFileURL(resolve(dirname(path),specifier)).href:import.meta.resolve(specifier))});
    }
    let rewritten=source;
    for(const edit of edits.toSorted((a,b)=>b.start-a.start))
      rewritten=rewritten.slice(0,edit.start)+edit.text+rewritten.slice(edit.end);
    rewritten+=`\nexport {${value.compiler} as enlumineCompileFrame};`;
    const module=await import(`data:text/javascript;base64,${Buffer.from(rewritten).toString("base64")}`);
    return module.enlumineCompileFrame;
  })();
  return compilerPromise;
}

export function encodeFrameSpec(value) {
  function plain(item,path=[]) {
    if(item===null||typeof item==="string"||typeof item==="boolean"||typeof item==="number"&&Number.isFinite(item))return item;
    if(item instanceof Set) {
      const allowed=path.length===1&&["rearm_kind_ids","optional_kind_ids"].includes(path[0])||
        path.length===4&&path[0]==="brace_kinds"&&path[1]==="prev_rules"&&typeof path[2]==="number"&&path[3]==="in_kind_ids";
      if(!allowed)throw new Error("Unknown compiled frame membership field");
      return Array.from(item,(member,index)=>plain(member,[...path,index]));
    }
    if(Array.isArray(item))return Array.from(item,(entry,index)=>plain(entry,[...path,index]));
    if(item&&Object.getPrototypeOf(item)===Object.prototype&&!Object.hasOwn(item,"$"))
      return Object.fromEntries(Object.entries(item).map(([key,entry])=>[key,plain(entry,[...path,key])]));
    throw new Error("Unsupported compiled frame value");
  }
  const json=JSON.stringify(plain(value));
  assert.deepEqual(enlumineReviveFrame(JSON.parse(json)),value);
  return brotliCompressSync(Buffer.from(json),{params:{[constants.BROTLI_PARAM_QUALITY]:11}}).toString("base64");
}

export async function compileFrameSpecs(specs) {
  const compile=await compiler();
  return specs.map(spec=>{
    const value=compile(spec);
    for(const rule of value.brace_kinds?.prev_rules ?? [])delete rule.in_kind_names;
    return `/* @__PURE__ */enlumineFrameSpecData(${JSON.stringify(encodeFrameSpec(value))})`;
  });
}

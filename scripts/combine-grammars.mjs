import ts from "typescript";
import assert from "node:assert/strict";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { optimizeGrammar, optimizeNearbyStates } from "./grammar-order.mjs";
import {tuneGrammar} from "./compress-grammar.mjs";
import {optimizePatternPrefixes} from "./pattern-prefix.mjs";

const revivePatterns=`const enlumineTexts=value=>{
  if(value&&typeof value==="object")typeof value.codes==="string"?value.codes=Array.from(value.codes,char=>char.charCodeAt()):Object.values(value).forEach(enlumineTexts);
};
for(const grammar of $POOL)if(grammar.char_maps&&grammar.patterns_by_state)grammar.patterns_by_state=grammar.patterns_by_state.map(state=>{
  if(!state)return state;
  const buckets=Array(128).fill(null);
  for(let i=0;i<state.length;i+=2)buckets[state[i]]=state[i+1].map(([rule_idx,codes,boundary])=>({codes,length:codes.length,rule_idx,boundary}));
  return buckets;
});else if(grammar.brace_kinds)enlumineTexts(grammar);
`;

function compactTexts(value) {
  if(Array.isArray(value))return value.map(compactTexts);
  if(!value||typeof value!=="object")return value;
  const keys=Object.keys(value);
  if(keys.length===1&&keys[0]==="codes"&&Array.isArray(value.codes)) {
    assert.ok(value.codes.every(code=>Number.isInteger(code)&&code>=0&&code<0xd800));
    return {codes:String.fromCharCode(...value.codes)};
  }
  assert.ok(!keys.includes("codes")||typeof value.codes!=="string");
  return Object.fromEntries(keys.map(key=>[key,compactTexts(value[key])]));
}

const isGrammarTable=grammar=>grammar?.char_maps?.$&&grammar.transitions?.$&&Array.isArray(grammar.patterns_by_state);

export function expandPatterns(tables) {
  return tables.map(grammar=>isGrammarTable(grammar)?{...grammar,patterns_by_state:grammar.patterns_by_state.map(state=>{
    if(!state)return null;
    const buckets=Array(128).fill(null);
    for(let i=0;i<state.length;i+=2)buckets[state[i]]=state[i+1].map(([rule_idx,codes,boundary])=>({codes,length:codes.length,rule_idx,...boundary&&{boundary:true}}));
    return buckets;
  })}:grammar);
}

function compactPatterns(tables) {
  return tables.map(grammar=>{
    if(!isGrammarTable(grammar))return grammar?.brace_kinds?compactTexts(grammar):grammar;
    return {...grammar,patterns_by_state:grammar.patterns_by_state.map(state=>{
      if(!state)return null;
      assert.equal(state.length,128);
      return state.flatMap((bucket,code)=>bucket?[code,bucket.map(pattern=>{
        assert.deepEqual(Object.keys(pattern).filter(key=>key!=="boundary"),["codes","length","rule_idx"]);
        assert.equal(pattern.length,pattern.codes.length);
        assert.ok(pattern.boundary===undefined||pattern.boundary===true);
        return pattern.boundary?[pattern.rule_idx,pattern.codes,1]:[pattern.rule_idx,pattern.codes];
      })]:[]);
    })};
  });
}

export function combineGrammars(source, onOptimization) {
  const path = "bundle.js";
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const options = { allowJs: true, noResolve: true, noLib: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = file => file === path ? ast : undefined;
  const checker = ts.createProgram([path], options, host).getTypeChecker();
  const loaders = new Set();
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== "@enlumine/core") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const binding of bindings.elements)
        if ((binding.propertyName?.text ?? binding.name.text) === "loadGrammar")
          loaders.add(checker.getSymbolAtLocation(binding.name));
  }
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        loaders.has(checker.getSymbolAtLocation(node.expression)) &&
        node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!calls.length) return source;
  const grammars = calls.map(call => JSON.parse(
    brotliDecompressSync(Buffer.from(call.arguments[0].text, "base64")).toString("utf8"),
  ));
  const encode = value => brotliCompressSync(Buffer.from(JSON.stringify(value)), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
  const value = calls.length === 1 ? grammars[0] : grammars;
  const optimized = optimizeGrammar(value,encode,{
    states:process.env.ENLUMINE_ORIGINAL_STATE_ORDER !== "1",
    rules:process.env.ENLUMINE_ORIGINAL_RULE_ORDER !== "1",
  });
  const tables=Array.isArray(optimized.value)?optimized.value:[optimized.value];
  const hasTables=tables.some(grammar=>grammar?.char_maps?.$&&grammar.transitions?.$);
  let tuned=hasTables?tuneGrammar(optimized.value,optimized.buffer):{buffer:optimized.buffer};
  let compression=tuned.parameters??{quality:11,mode:constants.BROTLI_MODE_GENERIC,window:22};
  const steps=optimized.steps.slice();
  let packed=optimized.value,current=optimized.value;
  if(hasTables&&process.env.ENLUMINE_ORIGINAL_STATE_ORDER!=="1") {
    const nearby=optimizeNearbyStates(optimized.value,value=>brotliCompressSync(Buffer.from(JSON.stringify(value)),{params:{
      [constants.BROTLI_PARAM_QUALITY]:compression.quality,
      [constants.BROTLI_PARAM_MODE]:compression.mode,
      [constants.BROTLI_PARAM_LGWIN]:compression.window,
    }}));
    if(nearby.steps.length) {
      packed=nearby.value;
      current=nearby.value;
      steps.push(...nearby.steps);
      tuned=tuneGrammar(nearby.value,nearby.buffer);
      compression=tuned.parameters??compression;
    }
  }
  if(hasTables) {
    const prefixes=optimizePatternPrefixes(packed,tuned.buffer,value=>brotliCompressSync(Buffer.from(JSON.stringify(value)),{params:{
      [constants.BROTLI_PARAM_QUALITY]:compression.quality,
      [constants.BROTLI_PARAM_MODE]:compression.mode,
      [constants.BROTLI_PARAM_LGWIN]:compression.window,
    }}));
    if(prefixes.prefix!==undefined) {
      steps.push({phase:"pattern-prefix",prefix:prefixes.prefix,beforeBytes:tuned.buffer.length,afterBytes:prefixes.buffer.length});
      current=prefixes.value;
      tuned=tuneGrammar(prefixes.value,prefixes.buffer);
      compression=tuned.parameters??compression;
    }
  }
  let revive="";
  if(hasTables&&calls.length>1&&Array.isArray(current)) {
    const compact=compactPatterns(current);
    const baseline=brotliCompressSync(Buffer.from(JSON.stringify(compact)),{params:{
      [constants.BROTLI_PARAM_QUALITY]:compression.quality,
      [constants.BROTLI_PARAM_MODE]:compression.mode,
      [constants.BROTLI_PARAM_LGWIN]:compression.window,
    }});
    tuned=tuneGrammar(compact,baseline);
    revive=revivePatterns;
  }
  const encoded = tuned.buffer.toString("base64");
  if (steps.length||tuned.parameters) onOptimization?.({beforeBytes:optimized.beforeBytes,afterBytes:tuned.buffer.length,steps,compression});
  if (calls.length === 1) {
    if (encoded === calls[0].arguments[0].text) return source;
    const argument = calls[0].arguments[0];
    return source.slice(0,argument.getStart(ast))+JSON.stringify(encoded)+source.slice(argument.end);
  }
  let prefix = "enluminePooled";
  while (source.includes(prefix)) prefix += "_";
  const kept = new Set();
  (function scan(node) {
    if (ts.isIdentifier(node) && loaders.has(checker.getSymbolAtLocation(node)) && !ts.isImportSpecifier(node.parent) &&
        !(ts.isCallExpression(node.parent) && node.parent.expression === node && calls.includes(node.parent)))
      kept.add(checker.getSymbolAtLocation(node));
    ts.forEachChild(node, scan);
  })(ast);
  const edits = calls.map((call, i) => ({start: call.getStart(ast), end: call.end, text: `${prefix}[${i}]`}));
  const imported = [`loadGrammar as ${prefix}Load`];
  for (const statement of ast.statements) {
    const bindings = ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === "@enlumine/core" &&
      !statement.importClause?.name && statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const binding of bindings.elements) {
      const symbol = checker.getSymbolAtLocation(binding.name);
      if (!loaders.has(symbol) || kept.has(symbol)) imported.push(binding.getText(ast));
    }
    edits.push({start: statement.getFullStart(), end: statement.end, text: ""});
  }
  let output = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  return `import {${imported.join(",")}} from "@enlumine/core";\n` +
    `const ${prefix}=${prefix}Load(${JSON.stringify(encoded)});\n` + revive.replaceAll("$POOL",prefix) + output;
}

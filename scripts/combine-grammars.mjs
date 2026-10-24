import ts from "typescript";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { optimizeGrammar, optimizeNearbyStates } from "./grammar-order.mjs";
import {tuneGrammar} from "./compress-grammar.mjs";
import {optimizePatternPrefixes} from "./pattern-prefix.mjs";

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
  let packed=optimized.value;
  if(hasTables&&process.env.ENLUMINE_ORIGINAL_STATE_ORDER!=="1") {
    const nearby=optimizeNearbyStates(optimized.value,value=>brotliCompressSync(Buffer.from(JSON.stringify(value)),{params:{
      [constants.BROTLI_PARAM_QUALITY]:compression.quality,
      [constants.BROTLI_PARAM_MODE]:compression.mode,
      [constants.BROTLI_PARAM_LGWIN]:compression.window,
    }}));
    if(nearby.steps.length) {
      packed=nearby.value;
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
      tuned=tuneGrammar(prefixes.value,prefixes.buffer);
      compression=tuned.parameters??compression;
    }
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
  let output = source;
  for (let i = calls.length - 1; i >= 0; i--)
    output = output.slice(0, calls[i].getStart(ast)) + `${prefix}[${i}]` + output.slice(calls[i].end);
  return `import {loadGrammar as ${prefix}Load} from "@enlumine/core";\n` +
    `const ${prefix}=${prefix}Load(${JSON.stringify(encoded)});\n` + output;
}

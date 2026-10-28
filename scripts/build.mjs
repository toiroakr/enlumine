import { build } from "esbuild";
import ts from "typescript";
import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { compile } from "@twinkleplop/core";
import { brotliCompressSync, constants } from "node:zlib";
import { isolateHtmlTables } from "./isolate-html-tables.mjs";
import { grammarArrays } from "./grammar-arrays.mjs";
import { pureInitializers } from "./pure-initializers.mjs";
import { minify } from "terser";
import { combineGrammars } from "./combine-grammars.mjs";
import { packGrammar } from "./pack-grammar.mjs";
import {sqlLexicalData} from "./sql-lexical-data.mjs";
import {removePatternSeals} from "./grammar-seals.mjs";
import {jsonLexicalData} from "./json-lexical-data.mjs";
import {frameAdapter,compileFrameSpecs} from "./frame-specs.mjs";
import {propertyMangling} from "./property-mangling.mjs";
import {typescriptFrameData} from "./typescript-frame-data.mjs";
import {typescriptTables} from "./typescript-grammar-data.mjs";
let sqlLexicalMetadata;
let jsonLexicalMetadata;
let typescriptMetadata;

const root = fileURLToPath(new URL("../", import.meta.url));
const outputRoot = resolve(process.env.ENLUMINE_BUILD_DIR ?? root);
const genericSql = process.env.ENLUMINE_GENERIC_SQL === "1";
const sizeBaseline = process.env.ENLUMINE_SIZE_BASELINE === "1";
const languages = ["json", "typescript", "sql", "graphql"];
const generated = resolve(root, ".generated");
const notices = new Map();
notices.set("line-rendering", `Line-oriented rendering\n${await readFile(resolve(root, "third-party/editor-LICENSE.txt"), "utf8")}`);
await mkdir(generated, { recursive: true });

function serialize(value) {
  const encoded = brotliCompressSync(
    Buffer.from(JSON.stringify(packGrammar(value))),
    {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    },
  ).toString("base64");
  return `loadGrammar(${JSON.stringify(encoded)})`;
}

const plugin = {
  name: "precompile-twinkleplop",
  setup(build) {
    build.onResolve({filter:/^enlumine:json-lexical-data$/},()=>({path:"data",namespace:"enlumine-json-data"}));
    build.onLoad({filter:/.*/,namespace:"enlumine-json-data"},async()=>{
      const generated=await jsonLexicalData();
      jsonLexicalMetadata=generated.metadata;
      notices.set(generated.packageName,generated.notice);
      return {contents:generated.contents,loader:"ts",resolveDir:root};
    });
    build.onResolve({filter:/^enlumine:typescript-grammar$/},()=>({path:"grammar",namespace:"enlumine-typescript-grammar"}));
    build.onLoad({filter:/.*/,namespace:"enlumine-typescript-grammar"},async()=>{
      const generated=await typescriptTables();
      typescriptMetadata=generated.metadata;
      const tables=generated.tables;
      for(const name of ["core","typescript","javascript","html","css"]) {
        const packageRoot=resolve(fileURLToPath(import.meta.resolve("@twinkleplop/"+name)),"../..");
        const pkg=JSON.parse(await readFile(resolve(packageRoot,"package.json"),"utf8"));
        notices.set(pkg.name,`${pkg.name}@${pkg.version}\n${await readFile(resolve(packageRoot,"LICENSE"),"utf8")}`);
      }
      return {contents:`import {loadGrammar} from "@enlumine/core";\n${Object.entries(tables).map(([name,table])=>`export const ${name}=${serialize(table)};`).join("\n")}`,loader:"ts",resolveDir:root};
    });
    build.onResolve({filter:/^enlumine:typescript-frames$/},()=>({path:"frames",namespace:"enlumine-typescript-frames"}));
    build.onLoad({filter:/.*/,namespace:"enlumine-typescript-frames"},async()=>({contents:await typescriptFrameData(),loader:"ts",resolveDir:root}));
    build.onResolve({filter:/^enlumine:sql-package$/},()=>({path:"package",namespace:"enlumine-sql-package"}));
    build.onLoad({filter:/.*/,namespace:"enlumine-sql-package"},()=>({
      contents:`export {default} from ${JSON.stringify(resolve(root,"packages/sql/src/index.ts"))};
        export {highlightSqlLines} from ${JSON.stringify(resolve(root,"packages/sql/src/editor.ts"))};`,
      loader:"ts",resolveDir:root,
    }));
    build.onResolve({filter:/^enlumine:sql-lexical-data$/},()=>({path:"data",namespace:"enlumine-sql-data"}));
    build.onLoad({filter:/.*/,namespace:"enlumine-sql-data"},async()=>{
      const generated=await sqlLexicalData();
      sqlLexicalMetadata=generated.metadata;
      notices.set(generated.packageName,generated.notice);
      return {contents:generated.contents,loader:"ts",resolveDir:root};
    });
    build.onResolve({filter:/^\.\/lexical\.js$/},args=>genericSql&&args.importer.endsWith("/packages/sql/src/index.ts")
      ? {path:"table",namespace:"enlumine-sql-table"}:undefined);
    build.onLoad({filter:/.*/,namespace:"enlumine-sql-table"},()=>({
      contents:`import {execute} from "@enlumine/core";
        import {grammar,reclassifiers} from "@twinkleplop/sql";
        const [classify,promote]=reclassifiers.map(item=>typeof item==="function"?item:item.reclassifier);
        export default source=>promote(source,classify(source,execute(source,grammar)));`,
      loader:"ts",resolveDir:resolve(root,"packages/sql/src"),
    }));
    build.onLoad({ filter: /@twinkleplop.*\.js$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const packageRoot = resolve(path, "../..");
      const pkg = JSON.parse(
        await readFile(resolve(packageRoot, "package.json"), "utf8"),
      );
      notices.set(
        pkg.name,
        `${pkg.name}@${pkg.version}\n${await readFile(resolve(packageRoot, "LICENSE"), "utf8")}`,
      );
      const ast = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const pure = new Set();
      const compilers = new Set();
      let sqlPromoter;
      let sqlWords;
      let sqlLookup;
      let sqlWordSource;
      let sqlWordBounds;
      let sqlWordGroups;
      let classifierTag;
      let specializedWordClassifier = false;
      let sqlPipeline;
      let sqlWordBinding;
      let sqlFunctionBinding;
      let specializedSql = false;
      let rawGrammar;
      let tokenizer;
      let factory;
      let classifier;
      let debug;
      for (const statement of ast.statements) {
        if (
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.text.startsWith("@twinkleplop/core")
        ) {
          const bindings = statement.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings))
            for (const item of bindings.elements) {
              const name = item.propertyName?.text ?? item.name.text;
              if (
                [
                  "match",
                  "on",
                  "keyword",
                  "within",
                  "fallback",
                  "range",
                  "enter",
                  "goto",
                  "leave",
                  "to",
                  "define_grammar",
                  "create_language",
                  "frame_track",
                ].includes(name)
              )
                pure.add(item.name.text);
              if (name === "compile") compilers.add(item.name.text);
              if (name === "tag" && !genericSql && pkg.name === "@twinkleplop/sql") classifierTag = item.name.text;
              if (!genericSql && pkg.name === "@twinkleplop/sql" && name === "promote_function_calls") sqlPromoter = item.name.text;
              if (!genericSql && pkg.name === "@twinkleplop/sql" && name === "compile_word_table") sqlWords = item.name.text;
              if (!genericSql && pkg.name === "@twinkleplop/sql" && name === "word_table_get") sqlLookup = item.name.text;
            }
        }
        if (
          ts.isExportDeclaration(statement) &&
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause)
        ) {
          for (const item of statement.exportClause.elements) {
            if (pkg.name === "@twinkleplop/sql" && item.name.text === "reclassifiers")
              sqlPipeline = item.propertyName?.text ?? item.name.text;
            if (!sizeBaseline && item.name.text === "range") pure.add(item.propertyName?.text ?? item.name.text);
            if (item.name.text === "raw_grammar")
              rawGrammar = item.propertyName?.text ?? item.name.text;
            if (item.name.text === "tokenize")
              tokenizer = item.propertyName?.text ?? item.name.text;
            if (item.name.text === "create_language")
              factory = item.propertyName?.text ?? item.name.text;
            if (item.name.text === "reclassify")
              classifier = item.propertyName?.text ?? item.name.text;
            if (item.name.text === "debug_enabled")
              debug = item.propertyName?.text ?? item.name.text;
          }
        }
      }
      const pureArrays = grammarArrays(ast, pure);
      const htmlTables = path.endsWith("twinkleplop.production.js") ? isolateHtmlTables(ast) : undefined;
      const frame=frameAdapter(ast,pkg.name);
      if(frame.calls.length) {
        if(source.includes("enlumineFrameSpecData"))throw new Error("Frame loader binding collision");
        frame.edits.push({start:0,end:0,text:'import {loadGrammar as enlumineFrameSpecData} from "@enlumine/core";\n'});
      }
      const edits = [...(htmlTables ? [htmlTables] : []),...frame.edits];
      const initializers = !sizeBaseline && path.endsWith("twinkleplop.production.js") ? pureInitializers(ast).filter(edit =>
        !htmlTables || edit.start < htmlTables.start || edit.start >= htmlTables.end) : [];
      edits.push(...initializers);
      const compileCalls = [];
      let checker;
      let debugSymbol;
      if (debug && path.endsWith("twinkleplop.production.js")) {
        const options = { allowJs: true, noResolve: true, noLib: true };
        const host = ts.createCompilerHost(options);
        host.getSourceFile = (file) => (file === path ? ast : undefined);
        checker = ts.createProgram([path], options, host).getTypeChecker();
        const declaration = ast.statements.find(
          (node) => ts.isFunctionDeclaration(node) && node.name?.text === debug,
        );
        if (!declaration) throw new Error("Missing upstream debug binding");
        debugSymbol = checker.getSymbolAtLocation(declaration.name);
      }
      function visit(node, depth = 0) {
        if (initializers.some(edit => node.getStart(ast) === edit.start && node.end === edit.end)) return;
        if(htmlTables && node !== ast && node.getStart(ast) >= htmlTables.start && node.end <= htmlTables.end) return;
        if (sqlLookup && depth === 0 && ts.isArrowFunction(node)) {
          let lookup;
          function findLookup(child) {
            if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === sqlLookup) {
              if (lookup) throw new Error("Multiple upstream SQL word lookups");
              lookup = child;
            }
            ts.forEachChild(child, findLookup);
          }
          findLookup(node.body);
          if (lookup) {
            if (specializedWordClassifier || lookup.arguments.length !== 4 || !ts.isIdentifier(lookup.arguments[0]))
              throw new Error("Unsupported upstream SQL word classifier");
            specializedWordClassifier = true;
            if (!ts.isVariableDeclaration(node.parent) || !ts.isIdentifier(node.parent.name))
              throw new Error("Unsupported upstream SQL word classifier binding");
            sqlWordBinding = node.parent.name.text;
            edits.push({start:node.getStart(ast),end:node.end,wordClassifier:lookup.arguments[0].getText(ast)});
            return;
          }
        }
        if(depth===0 && ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
           ["Uint8Array","Uint16Array","Uint32Array","Int32Array","Map","Set","WeakMap"].includes(node.expression.text))
          edits.push({start:node.getStart(ast),end:node.getStart(ast),text:"/* @__PURE__ */"});
        if ((rawGrammar || pureArrays.size) && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
            (node.name.text === rawGrammar || pureArrays.has(node.name.text)) && node.initializer &&
            ts.isVariableStatement(node.parent.parent) && node.parent.parent.parent === ast) {
          edits.push({start:node.initializer.getStart(ast),end:node.initializer.getStart(ast),text:"/* @__PURE__ */ (() => ("});
          edits.push({start:node.initializer.end,end:node.initializer.end,text:"))()"});
          ts.forEachChild(node, child => visit(child, depth + 1));
          return;
        }
        if (
          factory &&
          classifier &&
          node.parent === ast &&
          ts.isFunctionDeclaration(node) &&
          node.name?.text === factory &&
          path.endsWith("twinkleplop.production.js")
        ) {
          const [grammar, pipeline] = node.parameters;
          const grammarName = grammar.name.getText(ast);
          const pipelineName = pipeline.name.getText(ast);
          edits.push({
            start: node.body.getStart(ast),
            end: node.body.end,
            text: `{const enlumineRun=${classifier}(${pipelineName}.map(item=>typeof item==='function'?item:item.reclassifier));return ()=>input=>enlumineRun(input,enlumineExecute(input,${grammarName}));}`,
          });
          return;
        }
        if (
          tokenizer &&
          node.parent === ast &&
          ts.isFunctionDeclaration(node) &&
          node.name?.text === tokenizer &&
          path.endsWith("twinkleplop.production.js")
        ) {
          const [input, grammar] = node.parameters;
          edits.push({
            start: node.body.getStart(ast),
            end: node.body.end,
            text: `{return enlumineExecute(${input.name.getText(ast)},${grammar.name.getText(ast)});}`,
          });
          return;
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          if (classifierTag && node.expression.text === classifierTag)
            edits.push({start:node.expression.getStart(ast),end:node.expression.end,text:"enlumineClassifier"});
          if (sqlWords && node.expression.text === sqlWords) {
            const options = node.arguments[1];
            if(node.arguments.length !== 2 || !ts.isObjectLiteralExpression(options) || options.properties.length !== 1 ||
               options.properties[0].name?.getText(ast) !== "fold" || !["true","!0"].includes(options.properties[0].initializer?.getText(ast)))
              throw new Error("Unsupported upstream SQL word table options");
            if (sqlWordSource) throw new Error("Multiple upstream SQL word tables");
            sqlWordSource = node.arguments[0].getText(ast);
            edits.push({start:node.getStart(ast),end:node.end,wordGroups:sqlWordSource});
            return;
          }
          if (sqlLookup && node.expression.text === sqlLookup) {
            throw new Error("Unsupported standalone SQL word lookup");
          }
          if (sqlPromoter && depth === 0 && node.expression.text === sqlPromoter) {
            const [sourceType, targetType, variants] = node.arguments;
            if (node.arguments.length !== 3 || !ts.isStringLiteral(sourceType) || sourceType.text !== "identifier" ||
                !ts.isStringLiteral(targetType) || targetType.text !== "function" || !ts.isObjectLiteralExpression(variants) ||
                variants.properties.length !== 1 || variants.properties[0].name?.getText(ast) !== "plain" ||
                !["true", "!0"].includes(variants.properties[0].initializer?.getText(ast)))
              throw new Error("Unsupported upstream SQL function promotion configuration");
            specializedSql = true;
            if (!ts.isVariableDeclaration(node.parent) || !ts.isIdentifier(node.parent.name))
              throw new Error("Unsupported upstream SQL function classifier binding");
            sqlFunctionBinding = node.parent.name.text;
            edits.push({start:node.getStart(ast), end:node.end, text:"enlumineSqlFunctionCalls"});
            return;
          }

          if (
            debugSymbol &&
            checker.getSymbolAtLocation(node.expression) === debugSymbol
          ) {
            edits.push({
              start: node.getStart(ast),
              end: node.end,
              text: "false",
            });
            return;
          }
          if (compilers.has(node.expression.text)) {
            const grammar = compileCalls.length;
            compileCalls.push(node.arguments[0].getText(ast));
            edits.push({ start: node.getStart(ast), end: node.end, grammar });
            return;
          }
          if (depth === 0 && pure.has(node.expression.text))
            edits.push({
              start: node.getStart(ast),
              end: node.getStart(ast),
              text: "/* @__PURE__ */",
            });
        }
        ts.forEachChild(node, (child) =>
          visit(child, depth + (ts.isFunctionLike(node) ? 1 : 0)),
        );
      }
      visit(ast);
      if (sqlPromoter && !specializedSql) throw new Error("Missing pinned SQL function promotion call");
      if (sqlLookup && !specializedWordClassifier) throw new Error("Missing pinned SQL word classifier");
      let grammars;
      if (compileCalls.length || frame.calls.length) {
        const imports = await Promise.all(
          ast.statements.filter(ts.isImportDeclaration).map(async (node) => ({
            start: node.moduleSpecifier.getStart(ast),
            end: node.moduleSpecifier.end,
            text: JSON.stringify(
              pathToFileURL(
                (
                  await build.resolve(node.moduleSpecifier.text, {
                    resolveDir: resolve(path, ".."),
                    kind: "import-statement",
                  })
                ).path,
              ).href,
            ),
          })),
        );
        let extraction = source;
        for (const edit of imports.sort((a, b) => b.start - a.start))
          extraction =
            extraction.slice(0, edit.start) +
            edit.text +
            extraction.slice(edit.end);
        extraction += `\nexport const enlumineFrameSpecs=[${frame.calls.map(call=>call.arguments[0].getText(ast)).join(",")}];\nexport const enlumineRaw=[${compileCalls.join(",")}];\nexport const enlumineWords=${sqlWordSource ?? "undefined"};
          export const enlumineSqlPipeline=${sqlPipeline ?? "undefined"};
          export const enlumineSqlWord=${sqlWordBinding ?? "undefined"};
          export const enlumineSqlFunction=${sqlFunctionBinding ?? "undefined"};`;
        const { enlumineFrameSpecs, enlumineRaw, enlumineWords, enlumineSqlPipeline, enlumineSqlWord, enlumineSqlFunction } = await import(
          `data:text/javascript;base64,${Buffer.from(extraction).toString("base64")}`
        );
        if(frame.calls.length) {
          const compiled=await compileFrameSpecs(enlumineFrameSpecs);
          for(let i=0;i<frame.calls.length;i++) {
            const argument=frame.calls[i].arguments[0];
            edits.push({start:argument.getStart(ast),end:argument.end,text:compiled[i]});
          }
        }
        if (pkg.name === "@twinkleplop/sql") {
          const stages = enlumineSqlPipeline?.map(item => typeof item === "function" ? item : item.reclassifier);
          if (stages?.length !== 2 || (specializedSql &&
              (stages[0] !== enlumineSqlWord || stages[1] !== enlumineSqlFunction)))
            throw new Error("Unsupported upstream SQL classification pipeline");
        }
        const fields = [
          "transitions",
          "char_maps",
          "token_types",
          "patterns_by_state",
          "fallback_transitions",
          "non_ascii_by_state",
          "probe_mask",
          "probe_fallbacks",
          "boundary_flags",
          "run_kinds",
          "has_seals",
          "seal_flags",
          "fallback_seal_flags",
        ];
        grammars = enlumineRaw.map((raw) => {
          const grammar = compile(raw);
          const table = removePatternSeals(
            Object.fromEntries(fields.map((field) => [field, grammar[field]])),
          );
          for (const field of ["boundary_flags", "seal_flags", "fallback_seal_flags"])
            if (table[field] && !table[field].some(Boolean)) delete table[field];
          if(pkg.name === "@twinkleplop/graphql") table.entry_states=Object.fromEntries(
            ["selection","fields","arguments","definitions","value"].map(name=>{
              const state=grammar.states.get(name);
              if(state===undefined)throw new Error(`Missing GraphQL entry state: ${name}`);
              return [name,state];
            }));
          return table;
        });
        if (sqlWords) {
          if (!enlumineWords || grammars.length !== 1)
            throw new Error("Unsupported upstream SQL word table layout");
          let min = Infinity, max = 0;
          const seen = new Set();
          sqlWordGroups = enlumineWords.map(group => {
            const words = [];
            for (const word of group) {
              if (typeof word !== "string" || !word.length || /\s/.test(word))
                throw new Error("Unsupported upstream SQL word spelling");
              if (seen.has(word)) continue;
              seen.add(word);
              words.push(word);
              min = Math.min(min, word.length);
              max = Math.max(max, word.length);
            }
            if (!words.length) throw new Error("Unsupported empty SQL word group");
            return words.sort();
          });
          sqlWordBounds = [min, max];
          if (!plainSqlWords) grammars[0].word_groups = sqlWordGroups.map(group => group.join(" "));
        }
        if (specializedWordClassifier && grammars.some(grammar =>
          !grammar.token_types.includes("identifier") || ["keyword", "boolean", "type"].some(kind => grammar.token_types.includes(kind))))
          throw new Error("Unsupported upstream SQL token type layout");
      }
      let contents = source;
      for (const edit of edits.sort((a, b) => b.start - a.start))
        contents =
          contents.slice(0, edit.start) +
          (edit.grammar !== undefined
            ? sqlWords && !plainSqlWords ? "enlumineSqlGrammar" : serialize(grammars[edit.grammar])
            : edit.wordClassifier !== undefined
              ? `enlumineWordClassifier(${edit.wordClassifier},${sqlWordBounds.join(",")})`
            : edit.wordGroups !== undefined
              ? `enlumineCompileWords(${plainSqlWords ? JSON.stringify(sqlWordGroups.map(group => group.join(" "))) : "enlumineSqlGrammar.word_groups"})`
              : edit.text) +
          contents.slice(edit.end);
      if (specializedSql)
        contents = `import {promoteFunctionCalls as enlumineSqlFunctionCalls} from ${JSON.stringify(resolve(root, "packages/sql/src/functions.ts"))};\n` + contents;
      if (classifierTag)
        contents = "function enlumineClassifier(reclassifier){return reclassifier;}\n" + contents;
      if (sqlWords)
        contents = `import {compileWords as enlumineCompileWords,createWordClassifier as enlumineWordClassifier} from ${JSON.stringify(resolve(root,"packages/sql/src/words.ts"))};\n` + contents;
      if (sqlWords && !plainSqlWords)
        contents = `const enlumineSqlGrammar=${serialize(grammars[0])};\n` + contents;
      if (compileCalls.length)
        contents =
          `import {loadGrammar} from ${JSON.stringify("@enlumine/core")};\n` +
          contents;
      if (tokenizer && path.endsWith("twinkleplop.production.js"))
        contents =
          `import {execute as enlumineExecute} from ${JSON.stringify("@enlumine/core")};\n` +
          contents;
      return { contents, loader: "js", resolveDir: resolve(path, "..") };
    });
  },
};

const packages = ["core", ...languages, "terminal", "enlumine"];
for (const name of packages)
  await rm(resolve(outputRoot, "packages", name, "dist"), { recursive: true, force: true });
await rm(resolve(generated, "types"), { recursive: true, force: true });
const types = spawnSync(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "--emitDeclarationOnly"], {
  cwd: root,
  stdio: "inherit",
});
if (types.status !== 0) process.exit(types.status ?? 1);
const metadata = {};
for (const name of packages) {
  const entries = name==="sql"?{shared:"enlumine:sql-package","postgresql/index":"packages/sql/src/postgresql/index.ts","postgresql/editor":"packages/sql/src/postgresql/editor.ts"}:{index:`packages/${name}/src/index.ts`};
  if (name === "terminal") for (const theme of ["dark", "light", "ansi"])
    entries[`themes/${theme}`] = `packages/terminal/src/themes/${theme}.ts`;
  if (name === "enlumine") entries.cli = `packages/${name}/src/cli.ts`;
  if (name === "sql" || name === "graphql") {
    if(name!=="sql")entries.editor = `packages/${name}/src/editor.ts`;
    entries["themes/ansi"] = `packages/${name}/src/themes/ansi.ts`;
  }
  if (name === "graphql") entries.lexical = "packages/graphql/src/lexical.ts";
  const result = await build({
    absWorkingDir: root,
    entryPoints: entries,
    outdir: resolve(outputRoot, `packages/${name}/dist`),
    bundle: true,
    splitting: true,
    chunkNames: "[hash]",
    format: "esm",
    platform: "node",
    target: "node22",
    minify: true,
    metafile: true,
    external: ["@enlumine/*"],
    plugins: [plugin],
    legalComments: "eof",
    tsconfigRaw: { compilerOptions: {} },
  });
  if (name === "core" && Object.keys(result.metafile.inputs).some(path => !path.startsWith("packages/core/src/")))
    throw new Error("Core must not bundle language or rendering code");
  metadata[name] = result.metafile;
  metadata[name].enlumine = {minifier: sizeBaseline ? "esbuild" : "esbuild + terser", inputAttribution: "esbuild output before final compression", grammarOrder:[],...(name==="sql"&&!genericSql?{lexical:sqlLexicalMetadata}:name==="json"?{lexical:jsonLexicalMetadata}:name==="typescript"?{dedicated:typescriptMetadata}:{})};
  const manifest = JSON.parse(await readFile(resolve(root, "packages", name, "package.json"), "utf8"));
  if(name==="sql")for(const [entry,exports] of [["index",["default"]],["editor",["highlightSqlLines"]]]) {
    const path=resolve(outputRoot,"packages/sql/dist",`${entry}.js`);
    const code=`export{${exports.join(",")}}from"./shared.js";\n`;
    await writeFile(path,code);
    result.metafile.outputs[path]={imports:[{path:"./shared.js",kind:"import-statement",external:false}],exports,
      inputs:{},bytes:Buffer.byteLength(code),entryPoint:resolve(root,`packages/sql/src/${entry}.ts`)};
  }

  for (const [path, output] of Object.entries(result.metafile.outputs)) {
    const file = resolve(root, path);
    const original = await readFile(file, "utf8");
    const pooled = sizeBaseline || process.env.ENLUMINE_SEPARATE_GRAMMARS === "1" ? original
      : combineGrammars(original, result=>metadata[name].enlumine.grammarOrder.push({file:path,...result}));
    const mangle = name === "typescript" ? await propertyMangling(pooled, resolve(outputRoot, "packages/core/dist")) : true;
    const code = sizeBaseline ? original : (await minify(pooled, {module: true, ecma: 2022, mangle,
      compress: {passes: 4, hoist_funs: name === "core"}, format: {comments: /@license|@preserve|^!/}})).code + "\n";
    await writeFile(file, code);
    output.bytes = Buffer.byteLength(code);
    if (code.includes("Grammar exceeds state limit"))
      throw new Error(`Runtime compiler retained in ${path}`);
    for (const imported of output.imports) {
      const dependency = imported.path.split("/").slice(0, imported.path.startsWith("@") ? 2 : 1).join("/");
      if (imported.external && !imported.path.startsWith("node:") && !manifest.dependencies?.[dependency])
        throw new Error(`Undeclared runtime dependency in ${name}: ${imported.path}`);
    }
  }
  const declarations = name === "core" ? ["index", "core", "unpack", "tokens"]
    : name === "enlumine" ? ["index", "lexer", "languages"] : name === "graphql" ? ["index", "lexical", "editor", "themes/ansi"]
    : name === "sql" ? ["index", "lexical", "lexer", "highlighter", "editor", "themes/ansi", "postgresql/index", "postgresql/lexical", "postgresql/editor"]
    : name === "terminal" ? ["index", "types", "themes/dark", "themes/light", "themes/ansi"] : ["index"];
  for (const entry of declarations)
    await copyFile(resolve(generated, "types", name, "src", `${entry}.d.ts`),
      resolve(outputRoot, "packages", name, "dist", `${entry}.d.ts`));
}
await mkdir(resolve(outputRoot, ".generated"), {recursive:true});
await writeFile(resolve(outputRoot, ".generated", "build-meta.json"), JSON.stringify(metadata, null, 2));
const licenseGroups = new Map();
for (const [, text] of [...notices].sort(([a], [b]) => a.localeCompare(b))) {
  const newline = text.indexOf("\n");
  const name = text.slice(0, newline);
  const license = text.slice(newline + 1);
  const names = licenseGroups.get(license) ?? [];
  names.push(name);
  licenseGroups.set(license, names);
}
await writeFile(
  resolve(root, "THIRD_PARTY_NOTICES.txt"),
  [...licenseGroups]
    .map(([license, names]) => names.join("\n") + "\n\n" + license)
    .join("\n\n"),
);
for (const name of packages)
  await copyFile(resolve(root, "THIRD_PARTY_NOTICES.txt"),
    resolve(outputRoot, "packages", name, "THIRD_PARTY_NOTICES.txt"));

for (const name of packages)
  await copyFile(resolve(root, "LICENSE"), resolve(outputRoot, "packages", name, "LICENSE"));

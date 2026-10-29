import { test } from "node:test";
import assert from "node:assert/strict";
import sql from "../packages/sql/dist/index.js";
import { tokenize, raw_grammar } from "@twinkleplop/sql";
import { build } from "esbuild";
import { hasTaggedDollarQuote, hasNonAsciiIdentifier, differsFromUpstream } from "../scripts/token-tables.mjs";

const reference=tokenize();

test("SQL line tokenizing calls preserve public type tables and owned token results",async()=>{
  const options={bundle:true,write:false,format:"esm",platform:"node",target:"node22",minify:true};
  const own=await build({...options,stdin:{contents:'export {default} from "./packages/sql/dist/index.js";export {tokenizeLines} from "./packages/sql/dist/index.js";',resolveDir:new URL("../",import.meta.url).pathname}});
  const native=await build({...options,stdin:{contents:'import {tokenize} from "@twinkleplop/sql";export default tokenize();',resolveDir:new URL("../",import.meta.url).pathname}});
  const load=async result=>import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#editor-state`);
  const actual=await load(own),expected=(await load(native)).default;
  for(const line of [""," ","-- comment","/* comment */","$tag$body$tag$"]) {
    actual.tokenizeLines([line]);
    assert.deepEqual(actual.default(""),expected(""));
  }
  actual.tokenizeLines(["SELECT f(x)"]);
  expected("SELECT f(x)");
  for(const source of ["","SELECT NULL, f(x)"," "])assert.deepEqual(actual.default(source),expected(source));
  const retained=actual.default("SELECT id FROM users"),snapshot=structuredClone(retained);
  actual.tokenizeLines(["SELECT g(1), name FROM users"]);
  assert.deepEqual(retained,snapshot);
});

test("fresh SQL tokenizers preserve upstream type tables before and after their first nonempty input", async () => {
  const options={bundle:true,write:false,format:"esm",platform:"node",target:"node22",minify:true};
  const actual=await build({...options,entryPoints:[new URL("../packages/sql/dist/index.js",import.meta.url).pathname]});
  const expected=await build({...options,stdin:{contents:'import {tokenize} from "@twinkleplop/sql";export default tokenize();',resolveDir:new URL("../",import.meta.url).pathname}});
  for(const [index,first] of ["", "-- comment", "SELECT 1", "Key"].entries()) {
    const load=async result=>(await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}#${index}`)).default;
    const own=await load(actual),upstream=await load(expected);
    for(const source of [first,"","SELECT TRUE, UUID, CURSOR, f(x)","unknown_identifier"]) {
      const actual=own(source),expected=upstream(source);
      if(!differsFromUpstream(actual,source))assert.deepEqual(actual,expected,JSON.stringify(source));
    }
    const result=own("SELECT 1");
    result.token_types.length=0;
    assert.deepEqual(own("SELECT 1"),upstream("SELECT 1"));
  }
});
function nameOfFirst(source) {
  const result=sql(source);
  return result.token_types[result.tokens[0]];
}

test("SQL function promotion preserves balanced calls, comments, and quoted text", () => {
  for (const source of [
    "f()", "f ( 1 )", "f(g(x), h(y))", "f(')')", 'f(")")',
    "f(/* ) */ 1)", "f /* comment */ (1)", "f(1", "f(g())", "f(g()", "f())(",
    '"f"(x)', "`f`(x)", "[f](x)", "SELECT(x)", "COUNT(*)", "f\n(x)",
  ]) assert.deepEqual(sql(source),reference(source),source);
  assert.equal(nameOfFirst("f(x)"),"function");
  assert.equal(nameOfFirst("f /* comment */ (x)"),"identifier");
  assert.equal(nameOfFirst("f(x"),"identifier");
});

test("SQL function lookahead keeps the upstream 200-token bound", () => {
  for (const length of [0,1,198,199,200,201,400]) {
    const source=`f(${Array(length).fill("0").join(" ")})`;
    assert.deepEqual(sql(source),reference(source),`argument count ${length}`);
  }
  assert.equal(nameOfFirst(`f(${Array(199).fill("0").join(" ")})`),"function");
  assert.equal(nameOfFirst(`f(${Array(200).fill("0").join(" ")})`),"identifier");
});

test("SQL returned token arrays survive subsequent classifications", () => {
  const result=sql("SELECT f(x), id FROM users");
  const copy=structuredClone(result);
  for (const source of ["g(1)", "SELECT 42", "", "f(g(x))"]) sql(source);
  assert.deepEqual(result,copy);
});

test("SQL word classification preserves case folding, duplicate priority, and quoted names", () => {
  const words=["select","from","where","cursor","timestamp","null","true","unknown","varchar","key","current_timestamp","not_a_keyword"];
  for(const word of words) for(const source of [word,word.toUpperCase(),word[0].toUpperCase()+word.slice(1),`\"${word}\"`,`\`${word}\``,`[${word}]`])
    assert.deepEqual(sql(source),reference(source),source);
  for(const source of ["Key","SELECT İstanbul, ſelect, Énum, ıf;","SELECT CURSOR, cursor(), NULL, unknown, VARCHAR(20);"]) {
    const actual=sql(source),expected=reference(source);
    if(!differsFromUpstream(actual,source))assert.deepEqual(actual,expected,source);
  }
  assert.equal(nameOfFirst("CURSOR"),"type");
  assert.equal(nameOfFirst("UNKNOWN"),"boolean");
});

test("SQL vocabulary from the pinned upstream module retains classification in every case", async () => {
  const result = await build({
    stdin: {contents: 'export {tokenize} from "@twinkleplop/sql";', resolveDir: new URL("../", import.meta.url).pathname},
    bundle: true, write: false, format: "esm", platform: "node",
  });
  const {default: ts} = await import("typescript");
  const ast = ts.createSourceFile("sql.js", result.outputFiles[0].text, ts.ScriptTarget.Latest, true);
  const words = new Set();
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      for (const word of node.text.split(/[.\s]+/)) if (/^[A-Za-z_]{1,128}$/.test(word)) words.add(word);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok([...words].some(word => word.toLowerCase() === "cursor"));
  assert.ok([...words].some(word => word.toLowerCase() === "varchar"));
  for (const word of words) for (const spelling of [word.toLowerCase(), word.toUpperCase(), word[0].toUpperCase() + word.slice(1).toLowerCase()])
    assert.deepEqual(sql(spelling), reference(spelling), spelling);
});


test("SQL lexical execution preserves upstream probes, escapes, operators, and incomplete input", t => {
  let count=0;
  // Upstream knows neither PostgreSQL's tagged dollar quoting ($tag$ ... $tag$) nor non-ASCII identifier characters; sql-dialects.test.mjs pins ours.
  const check=source=>{const actual=sql(source);if(differsFromUpstream(actual,source))return;assert.deepEqual(actual,reference(source),JSON.stringify(source));count++;};
  for(let code=0;code<256;code++) for(const prefix of ["$","@","@@",":","?","e'","U&'","0x","1e","1."]) {
    check(prefix+String.fromCharCode(code)+"x");
    if(prefix==="$"||prefix==="@"||prefix==="@@")
      for(const suffix of ["1"," ","","\n","$","@"])check(prefix+String.fromCharCode(code)+suffix);
  }
  const operators=raw_grammar.states.main.rules.filter(rule=>rule.token==="operator").flatMap(rule=>rule.match);
  for(const operator of operators) for(const prefix of ["","+","?","@","$","1","x",")"])
    for(const suffix of ["","x","1","(",")"])check(prefix+operator+suffix);
  const fragments=["a","_x","Z","0","1","e","E","n","N","b","B","x","X","0x","0b","0o","0X","1e+","1_","1.","'",'"',"`","[",
    "]","\\","\\x","\\u","\\U","\\0","''",'""',"``", "]]","$$","$tag$","$1","@","@@",":","?","/","*","--","#"," ","\n","\r","\t","\0","🌟","ΩΩ","K","\ud800","\udfff","+","-","<=>","#>>","->>","@>","::","?|","?&"];
  const wide=/[^\0-\x7f]/;
  const ascii=fragments.filter(fragment=>!wide.test(fragment));
  let seed=737;
  for(let i=0;i<15000;i++) {
    let source="";
    for(let n=0;n<20;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source+=ascii[seed%ascii.length];}
    check(source);
  }
  // Non-ASCII input has no upstream counterpart: a non-ASCII letter must split the source exactly like an ASCII letter in its place,
  // and a Unicode space like a control character that the lexer skips. Fragments with @, : or ? are left out: whether they start a variable
  // comes from upstream probes over ASCII classes, and sql-dialects.test.mjs pins the non-ASCII names after them.
  const mixed=[...fragments.filter(fragment=>!/[@:?]/.test(fragment)),"\u00e9","\u3000","\u0085"];
  const segments=(source)=>{const {tokens,token_types}=sql(source);return Array.from({length:tokens.length/3},(_,k)=>{const kind=token_types[tokens[k*3]];return [["keyword","boolean","type"].includes(kind)?"identifier":kind,tokens[k*3+1],tokens[k*3+2]].join(":");});};
  for(let i=0;i<8000;i++) {
    let source="";
    for(let n=0;n<20;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source+=mixed[seed%mixed.length];}
    const projected=source.replace(/[^\0-\x7f]/g,char=>/[\s\u0085]/.test(char)?String.fromCharCode(1):"Q");
    assert.deepEqual(segments(source),segments(projected),JSON.stringify(source));
  }
  t.diagnostic(`${count} independent upstream packed-token comparisons`);
});

test("the exemption for dollar-quoted strings does not skip ordinary strings that merely contain a dollar sign",()=>{
  for(const source of ["SELECT 'a\\n$not_a_tag'","SELECT 'a''$ab$'","SELECT 'a\\n$ab$'"])
    assert.equal(hasTaggedDollarQuote(sql(source),source),false,source);
  for(const source of ["SELECT $t$x$t$","SELECT 1, $é$x$é$ FROM t","SELECT ''$t$x$t$"])
    assert.equal(hasTaggedDollarQuote(sql(source),source),true,source);
});

test("the exemption for non-ASCII identifiers skips only unquoted identifiers that contain them",()=>{
  for(const source of ["SELECT café","SELECT \u540d\u524d(1)","a\u3000\u540d\u524d"])
    assert.equal(hasNonAsciiIdentifier(sql(source),source),true,source);
  for(const source of ['SELECT "café"',"SELECT `\u540d\u524d`","SELECT [\u540d\u524d]","SELECT 'café'","SELECT /* \u540d\u524d */ 1","SELECT café_ok".replace("é","e")])
    assert.equal(hasNonAsciiIdentifier(sql(source),source),false,source);
});

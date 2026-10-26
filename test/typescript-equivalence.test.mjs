import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { tokenize } from "@twinkleplop/typescript";
import runtime from "../packages/typescript/dist/index.js";
import { sameTables } from "../scripts/token-tables.mjs";

const reference = tokenize();
const soft = new Set("type from of as get set async static readonly declare abstract accessor override module namespace".split(" "));
const withoutSoftKeywords = items => items.splice(0, items.length, ...items.filter(item => !item.split(/\W+/).some(word => soft.has(word))));
const same = source => assert.ok(sameTables(runtime(source), reference(source), source), JSON.stringify(source));

function generator(seed) {
  const random = n => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 8) % n;
  const pick = items => items[random(items.length)];
  return { random, pick };
}

const fragments = [
  "type", "interface", "enum", "namespace", "module", "declare", "abstract", "readonly", "public", "private", "protected", "static", "async", "get", "set",
  "override", "accessor", "as", "satisfies", "keyof", "infer", "is", "using", "implements", "extends", "new", "function", "class", "const", "let", "var", "import", "export", "from",
  "return", "if", "else", "for", "while", "do", "switch", "case", "try", "catch", "finally", "throw", "yield", "await", "typeof", "instanceof", "in", "of", "void", "this", "super",
  "null", "undefined", "true", "false", "any", "never", "unknown", "object", "string", "number", "A", "B", "T", "U", "x", "y", "foo", "bar", "Baz", "FOO_BAR", "_a", "$b",
  "(", ")", "{", "}", "[", "]", "<", ">", ">>", ">>>", "<<", "=", "=>", "==", "===", "!=", "?", "?:", "?.", "??", ":", ";", ",", ".", "...", "*", "+", "-", "/", "%", "&", "|", "&&", "||", "!", "~", "@", "#p", "<=", ">=", "+=", "**",
  "1", "0x1f", "1_000n", "'s'", '"d"', "`t`", "`a${x}b`", "/re/g", "// c\n", "/* c */", "/** @type {X} */", " ", " ", " ", "\n", "\t",
  "html`<b>${x}</b>`", "css`.a{color:red}`", "html`<script>let a=1;</script>`", "()", "{}", "[]", "<T>", "<T,>", "=>{", "): ", "){", "}:", "?(", "!:", ": ", " = ", " as const",
];

withoutSoftKeywords(fragments);

test("typescript: random token soup matches upstream token tables", () => {
  const { random, pick } = generator(12345);
  for (let i = 0; i < 4000; i++) {
    let source = "";
    for (let j = 0, length = 3 + random(40); j < length; j++) source += pick(fragments) + pick(["", " ", " ", " ", "\n"]);
    same(source);
  }
});

const softStatements = [
  "const type = 1;", "type(x);", "obj.of(1);", "({ get: 1, set: 2 });", "function f(type, from, of) {}", "const g = (as, async) => as;",
  "class A { type = 1; static async = 2; get() {} set(v) {} static from() {} }", "import { type as t } from 'm';", "x = { as, async, static };",
  "const { type, of } = y;", "type Foo = string;", "for (const x of y) {}", "export type { A };", "declare module 'm' {}",
  "abstract class B { abstract m(): void; readonly r = 1 }", "namespace N { export const a = 1 }", "let from = 1; from++;",
  "interface I { readonly a: string; get: number; set(v: T): void; type: string }", "const o = { module: 1, namespace: 2, declare: 3, abstract: 4 };",
  "a.type = b.from + c.of;", "if (as) { override(); }", "async function h() { await accessor(); }", "enum E { type, from }",
];

test("typescript: contextual keywords used as names match upstream token tables", () => {
  const { random, pick } = generator(777);
  for (let i = 0; i < 1500; i++) {
    let source = "";
    for (let j = 0, length = 1 + random(6); j < length; j++) source += pick(softStatements) + pick([" ", "\n", "\n\n"]);
    same(source);
  }
  for (const statement of softStatements) {
    same(statement);
    for (let end = 1; end < statement.length; end++) same(statement.slice(0, end));
  }
});

const javascript = ["let", "const", "function", "class", "async", "await", "x", "y", "FOO", "foo", "=", "=>", "(", ")", "{", "}", "[", "]", ",", ";", ":", ".", "?", "<", ">", "1", "'s'", "`t`", "...", "*", "new", "return", "extends", "if", "else", "get", "static", "(a, b = 1)", "{ a, b }", "a ? b : c", "// c", "/** doc @param {A} x */", "/* c */", "import", "from", "'m'", "export", "type", "as", "interface", "enum", "namespace", "<T>", "satisfies", "this", "super", "null", "true", "yield", "of", "in"];
withoutSoftKeywords(javascript);
const styles = [".a", "#b", "{", "}", "color", ":", "red", ";", "margin", "0", "px", "(", ")", "calc", "var", "--x", "@media", "(min-width: 1px)", ",", "!important", "/* c */", "&", ">", "+", "~", "[a=b]", "url(x)", "rgb(1,2,3)", " ", "\n"];
const tags = ["div", "span", "script", "style", "a", "br", "input", "p"];

function embedded(seed) {
  const { random, pick } = generator(seed);
  const code = n => Array.from({ length: n }, () => pick(javascript)).join(" ");
  const css = n => Array.from({ length: n }, () => pick(styles)).join(random(2) ? " " : "");
  const hole = () => pick(["${x}", "${a.b}", "${ `n${1}` }", "${fn({a:1})}", "${}", "${"]);
  const html = depth => {
    const parts = [];
    for (let i = 0, count = 1 + random(6); i < count; i++) {
      const kind = random(9);
      if (kind === 1) parts.push(`<${pick(tags)} ${pick(["class", "id", "data-x"])}=${pick(['"v"', "'v'", "${x}", "v"])}>`);
      else if (kind === 2) parts.push(`</${pick(tags)}>`);
      else if (kind === 3) parts.push(`<script>${code(random(10))}</script>`);
      else if (kind === 4) parts.push(`<style>${css(random(8))}</style>`);
      else if (kind === 5) parts.push(pick(["text", "<!-- c -->", "<", "&amp;", "<br/>", "<!DOCTYPE html>", "<script", "<style>", "</script>"]));
      else if (kind === 6 && depth < 2) parts.push(`<script>html\`${html(depth + 1)}\`</script>`);
      else parts.push(hole());
    }
    return parts.join(pick(["", " ", "\n"]));
  };
  const template = () => {
    const tag = pick(["html", "css", "html", "gql", "sql"]);
    const body = tag === "html" ? html(0) : tag === "css" ? css(1 + random(10)) + (random(2) ? hole() : "") : code(3);
    return `${tag}\`${body}${random(8) ? "`" : ""}`;
  };
  const documentation = () => `/** ${Array.from({ length: 1 + random(5) }, () => pick(["@param {string} x", "@type {A | B}", "{@link Foo}", "text", "@returns {Promise<void>}", "*", "\n *", "@example\n code", "@param {{a: number}} o", "{", "}", "<b>", "`c`", "@see x"])).join(" ")}${random(6) ? " */" : ""}`;
  const statement = () => {
    const kind = random(6);
    if (kind === 0) return `const t = ${template()};`;
    if (kind === 1) return `${documentation()}\n${code(random(8))}`;
    if (kind === 2) return `f(${template()}, ${code(2)})`;
    if (kind === 3) return code(random(14));
    if (kind === 4) return `${documentation()} function f(a: ${code(2)}) {}`;
    return `class A { m() { return ${template()} } }`;
  };
  return () => {
    let source = Array.from({ length: 1 + random(3) }, statement).join(pick(["\n", " ", ";"]));
    if (random(3) === 0) source = source.slice(0, random(source.length + 1));
    return source;
  };
}

test("typescript: embedded html, css and JSDoc regions match upstream token tables", () => {
  const next = embedded(99);
  for (let i = 0; i < 3000; i++) same(next());
});

test("typescript: this repository's own sources and their prefixes match upstream token tables", async () => {
  const directories = ["../packages/core/src", "../packages/typescript/src", "../scripts"];
  for (const directory of directories) {
    const base = new URL(`${directory}/`, import.meta.url);
    for (const name of (await readdir(base)).filter(file => /\.(ts|mjs)$/.test(file))) {
      const source = await readFile(new URL(name, base), "utf8");
      same(source);
      for (let end = 1; end < source.length; end += Math.max(97, source.length >> 4)) same(source.slice(0, end));
    }
  }
});

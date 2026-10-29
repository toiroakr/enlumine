import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import generic from "../packages/sql/dist/index.js";
import postgresql from "../packages/sql/dist/postgresql/index.js";
import { tokenizeLines as postgresqlTokenizeLines } from "../packages/sql/dist/postgresql/index.js";
import { highlightLines } from "../packages/terminal/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const reset = "\x1b[0m";
const stringOnly = { string: "[S]" };

function spans(tokenize, source) {
  const { tokens, token_types } = tokenize(source);
  const result = [];
  for (let i = 0; i < tokens.length; i += 3)
    result.push([token_types[tokens[i]], source.slice(tokens[i + 1], tokens[i + 2])]);
  return result;
}

const tokenizeLinesOf = postgresqlTokenizeLines;
const render = (lines) => highlightLines(lines, { tokenizeLines: postgresqlTokenizeLines, styles: stringOnly }).map(line => line.replaceAll(reset, ""));

test("PostgreSQL treats a backslash inside a plain string as an ordinary character", () => {
  assert.deepEqual(spans(postgresql, "SELECT '\\', 1"), [
    ["keyword", "SELECT"],
    ["string", "'\\'"],
    ["punctuation", ","],
    ["number", "1"],
  ]);
});

test("PostgreSQL keeps backslash escapes inside E strings", () => {
  assert.deepEqual(spans(postgresql, "E'a\\'b' x"), [
    ["identifier", "E"],
    ["string", "'a"],
    ["string_escape", "\\'"],
    ["string", "b'"],
    ["identifier", "x"],
  ]);
});

test("PostgreSQL treats [ and ] as punctuation instead of a quoted identifier", () => {
  assert.deepEqual(spans(postgresql, "x['a'][1]"), [
    ["identifier", "x"],
    ["punctuation", "["],
    ["string", "'a'"],
    ["punctuation", "]["],
    ["number", "1"],
    ["punctuation", "]"],
  ]);
});

test("a tagged dollar-quoted string stays one string, with the same tag closing it", () => {
  assert.deepEqual(spans(postgresql, "SELECT $tag$it's $$ x$tag$ AS y"), [
    ["keyword", "SELECT"],
    ["string", "$tag$it's $$ x"],
    ["string", "$tag$"],
    ["keyword", "AS"],
    ["identifier", "y"],
  ]);
  assert.deepEqual(spans(generic, "$a$b$a$"), [["string", "$a$b"], ["string", "$a$"]]);
});

test("a dollar-quote tag may contain non-ASCII letters, as in PostgreSQL identifiers", () => {
  assert.deepEqual(spans(postgresql, "SELECT $é$-- literal$é$ AS x"), [
    ["keyword", "SELECT"],
    ["string", "$é$-- literal"],
    ["string", "$é$"],
    ["keyword", "AS"],
    ["identifier", "x"],
  ]);
});

test("a dollar-quote tag right after a non-ASCII identifier character does not open a string", () => {
  assert.ok(!spans(postgresql, "SELECT café$tag$x FROM t").some(([kind]) => kind === "string"));
  assert.deepEqual(spans(postgresql, "SELECT café$tag$x FROM t").at(-1), ["identifier", "t"]);
});

test("an untagged $$ right after a non-ASCII identifier character does not open a string", () => {
  assert.ok(!spans(postgresql, "SELECT café$$ FROM t").some(([kind]) => kind === "string"));
  assert.ok(!spans(generic, "SELECT café$$ FROM t").some(([kind]) => kind === "string"));
  assert.deepEqual(spans(postgresql, "SELECT $$x$$").filter(([kind]) => kind === "string"), [["string", "$$x"], ["string", "$$"]]);
});

test("a dollar-quote opener later in the same identifier does not open a string either", () => {
  for (const entry of [postgresql, generic]) {
    assert.ok(!spans(entry, "SELECT café$$body$$ FROM t").some(([kind]) => kind === "string"));
    assert.ok(!spans(entry, "SELECT café$a$$b$ FROM t").some(([kind]) => kind === "string"));
  }
});

test("unquoted identifiers may contain non-ASCII characters, as in PostgreSQL", () => {
  for (const entry of [postgresql, generic]) {
    assert.deepEqual(spans(entry, "SELECT café FROM t"), [
      ["keyword", "SELECT"], ["identifier", "café"], ["keyword", "FROM"], ["identifier", "t"],
    ]);
    assert.deepEqual(spans(entry, "SELECT \u540d\u524d, café$x FROM \u9867\u5ba2"), [
      ["keyword", "SELECT"], ["identifier", "\u540d\u524d"], ["punctuation", ","], ["identifier", "café$x"], ["keyword", "FROM"], ["identifier", "\u9867\u5ba2"],
    ]);
    assert.deepEqual(spans(entry, "SELECT x_é1 AS \u540d\u524d"), [
      ["keyword", "SELECT"], ["identifier", "x_é1"], ["keyword", "AS"], ["identifier", "\u540d\u524d"],
    ]);
  }
});

test("a non-ASCII identifier followed by a parenthesis is a function call", () => {
  assert.deepEqual(spans(postgresql, "SELECT \u95a2\u6570(1)")[1], ["function", "\u95a2\u6570"]);
});

test("a Unicode space ends an identifier instead of joining it", () => {
  assert.deepEqual(spans(postgresql, "SELECT\u3000\u540d\u524d\u00a0FROM"), [
    ["keyword", "SELECT"], ["identifier", "\u540d\u524d"], ["keyword", "FROM"],
  ]);
});

test("keywords are matched case-insensitively for ASCII letters only", () => {
  assert.deepEqual(spans(postgresql, "\u212aey"), [["identifier", "\u212aey"]]);
  assert.deepEqual(spans(postgresql, "İstanbul, ſelect, Énum, ıf"), [
    ["identifier", "İstanbul"], ["punctuation", ","], ["identifier", "ſelect"], ["punctuation", ","], ["identifier", "Énum"], ["punctuation", ","], ["identifier", "ıf"],
  ]);
});

test("U+0085 (next line) is a Unicode space that ends an identifier", () => {
  assert.deepEqual(spans(postgresql, "foo\u0085bar"), [["identifier", "foo"], ["identifier", "bar"]]);
});

test("a named parameter may contain non-ASCII characters in the default entry only", () => {
  assert.deepEqual(spans(generic, ":caf\u00e9"), [["variable", ":caf\u00e9"]]);
  assert.deepEqual(spans(generic, "@caf\u00e9 x"), [["variable", "@caf\u00e9"], ["identifier", "x"]]);
  assert.deepEqual(spans(postgresql, ":caf\u00e9"), [["operator", ":"], ["identifier", "caf\u00e9"]]);
});

test("a numbered parameter is not mistaken for a dollar-quote tag", () => {
  assert.deepEqual(spans(postgresql, "$1, $2"), [["variable", "$1"], ["punctuation", ","], ["variable", "$2"]]);
});

test("PostgreSQL has no @name, :name or ? parameters: they are operators followed by an operand", () => {
  assert.deepEqual(spans(postgresql, "a @ b, @x"), [
    ["identifier", "a"], ["operator", "@"], ["identifier", "b"], ["punctuation", ","], ["operator", "@"], ["identifier", "x"],
  ]);
  assert.deepEqual(spans(postgresql, "a[1:2]"), [
    ["identifier", "a"], ["punctuation", "["], ["number", "1"], ["operator", ":"], ["number", "2"], ["punctuation", "]"],
  ]);
  assert.deepEqual(spans(postgresql, "'{}'::jsonb ? 'a'").slice(-2), [["operator", "?"], ["string", "'a'"]]);
  assert.deepEqual(spans(postgresql, "$1"), [["variable", "$1"]]);
  for (const source of ["a @@ b", "a @@b", "a@@b"])
    assert.deepEqual(spans(postgresql, source).map(([kind]) => kind), ["identifier", "operator", "identifier"], source);
});

test("the default entry still reads @name, :name and ? as parameters", () => {
  assert.deepEqual(spans(generic, "@x :y ?"), [["variable", "@x"], ["variable", ":y"], ["identifier", "?"]]);
});

test("PostgreSQL treats # as an operator instead of a line comment", () => {
  assert.deepEqual(spans(postgresql, "a # b"), [["identifier", "a"], ["operator", "#"], ["identifier", "b"]]);
});

test("PostgreSQL tokenizes a long chain of # operators in linear time", () => {
  const source = "1" + " # 1".repeat(40000);
  const started = performance.now();
  const kinds = spans(postgresql, source).map(([kind]) => kind);
  assert.equal(kinds.filter(kind => kind === "operator").length, 40000);
  assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
});

test("PostgreSQL still reads #> and #>> as one operator", () => {
  assert.deepEqual(spans(postgresql, "a #> b #>> c"), [
    ["identifier", "a"], ["operator", "#>"], ["identifier", "b"], ["operator", "#>>"], ["identifier", "c"],
  ]);
});

test("PostgreSQL does not quote identifiers with backticks", () => {
  assert.deepEqual(spans(postgresql, "`a`").filter(([, text]) => text === "`a`"), []);
});

test("the default entry still accepts every dialect's quoting", () => {
  assert.deepEqual(spans(generic, "'a\\'b'"), [["string", "'a"], ["string_escape", "\\'"], ["string", "b'"]]);
  assert.deepEqual(spans(generic, "[a b]"), [["identifier", "[a b]"]]);
  assert.deepEqual(spans(generic, "`a`"), [["identifier", "`a`"]]);
  assert.deepEqual(spans(generic, "# note"), [["comment", "# note"]]);
});

test("PostgreSQL line highlighting does not carry a '\\' string into the following lines", () => {
  assert.deepEqual(render(["SELECT replace(path, '\\', '/') AS p", "FROM t", "WHERE x = 1"]), [
    "SELECT replace(path, [S]'\\', [S]'/') AS p",
    "FROM t",
    "WHERE x = 1",
  ]);
});

test("PostgreSQL line highlighting colours array elements as strings, also when the array spans lines", () => {
  assert.deepEqual(render(["SELECT ARRAY['a', 'b'] AS xs", "SELECT ARRAY[", "  'a',", "  'b'", "]"]), [
    "SELECT ARRAY[[S]'a', [S]'b'] AS xs",
    "SELECT ARRAY[",
    "  [S]'a',",
    "  [S]'b'",
    "]",
  ]);
});

test("PostgreSQL line highlighting does not read a $ inside an identifier as a dollar-quote tag", () => {
  assert.deepEqual(render(["SELECT a$b$c FROM t", "WHERE x = 1", "AND y = 2"]), [
    "SELECT a$b$c FROM t",
    "WHERE x = 1",
    "AND y = 2",
  ]);
});

test("PostgreSQL line highlighting reads a dollar-quote tag with non-ASCII letters", () => {
  assert.deepEqual(render(["SELECT $é$-- a", "b$é$, 1"]), ["SELECT [S]$é$-- a", "[S]b$é$, 1"]);
});

test("PostgreSQL line highlighting does not open a dollar-quoted string after a non-ASCII identifier character", () => {
  assert.deepEqual(render(["SELECT café$tag$x FROM t", "WHERE 1"]), ["SELECT café$tag$x FROM t", "WHERE 1"]);
});

test("PostgreSQL line highlighting does not open an untagged $$ string after a non-ASCII identifier character", () => {
  assert.deepEqual(render(["SELECT café$$ FROM t", "WHERE 1"]), ["SELECT café$$ FROM t", "WHERE 1"]);
});

test("PostgreSQL line highlighting does not open a string at a later dollar sign of the same identifier", () => {
  assert.deepEqual(render(["SELECT café$$body$$ FROM t", "WHERE 1"]), ["SELECT café$$body$$ FROM t", "WHERE 1"]);
});

test("line highlighting colours a non-ASCII identifier like an ASCII one, and a Unicode space stays a gap", () => {
  const colours = { keyword: "[K]", identifier: "[I]", special: "[X]" };
  const lines = ["SELECT \u540d\u524d FROM \u9867\u5ba2", "SELECT\u3000café$x"];
  const plain = lines.map(line => line.replace(/[\u3000]/g, " "));
  assert.deepEqual(highlightLines(lines, { tokenizeLines: postgresqlTokenizeLines, styles: colours }).map(line => line.replaceAll(reset, "")), [
    "[K]SELECT [I]\u540d\u524d [K]FROM [I]\u9867\u5ba2",
    "[K]SELECT\u3000[I]café$x",
  ]);
  assert.equal(plain.length, 2);
});

test("PostgreSQL line highlighting reads the E prefix after a non-ASCII letter like the one after an ASCII letter", () => {
  const kinds = (lines) => tokenizeLinesOf(lines).map(({ tokens, token_types }) => Array.from({ length: tokens.length / 3 }, (_, i) => token_types[tokens[i * 3]]));
  assert.deepEqual(kinds(["SELECT \u00e9E'a\\'b'", "SELECT 1"]), kinds(["SELECT xE'a\\'b'", "SELECT 1"]));
});

test("PostgreSQL line highlighting keeps an E string open across an escaped quote and a line break", () => {
  assert.equal(render(["SELECT E'a\\'b", "c' AS x"])[1], "[S]c' AS x");
});

test("a bundle of one dialect does not contain the other dialects' lexical rules", async () => {
  const bundle = async (entry) => (await build({
    stdin: { contents: `export {default} from ${JSON.stringify(entry)};`, resolveDir: root },
    bundle: true, write: false, minify: true, format: "esm", platform: "node", target: "node22",
  })).outputFiles[0].text;
  const postgresqlOnly = await bundle(`${root}packages/sql/dist/postgresql/index.js`);
  const everyDialect = await bundle(`${root}packages/sql/dist/index.js`);
  assert.ok(everyDialect.includes('"`['), "the default entry must carry the backtick and bracket identifier quotes");
  assert.ok(!postgresqlOnly.includes('"`['), "the PostgreSQL entry must not carry them");
});

test("a bundle without the line tokenizer does not contain it", async () => {
  for (const entry of ["index.js", "postgresql/index.js"]) {
    const bundle = async (name) => (await build({
      stdin: { contents: `export {${name}} from ${JSON.stringify(`${root}packages/sql/dist/${entry}`)};`, resolveDir: root },
      bundle: true, write: false, minify: true, format: "esm", platform: "node", target: "node22",
    })).outputFiles[0].text;
    assert.ok((await bundle("tokenizeLines")).includes('"special"'), `${entry} must carry the line tokenizer when it is imported`);
    assert.ok(!(await bundle("default")).includes('"special"'), `${entry} carries the line tokenizer in a tokenizer-only bundle`);
  }
});

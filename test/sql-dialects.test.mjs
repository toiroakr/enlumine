import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import generic from "../packages/sql/dist/index.js";
import postgresql from "../packages/sql/dist/postgresql/index.js";
import { tokenizeLines as postgresqlTokenizeLines } from "../packages/sql/dist/postgresql/index.js";
import { highlightLines } from "../packages/terminal/dist/index.js";

const root = new URL("../", import.meta.url).pathname;
const reset = "\x1b[0m";
const stringOnly = { string: "[S]" };

function spans(tokenize, source) {
  const { tokens, token_types } = tokenize(source);
  const result = [];
  for (let i = 0; i < tokens.length; i += 3)
    result.push([token_types[tokens[i]], source.slice(tokens[i + 1], tokens[i + 2])]);
  return result;
}

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

test("a numbered parameter is not mistaken for a dollar-quote tag", () => {
  assert.deepEqual(spans(postgresql, "$1, $2"), [["variable", "$1"], ["punctuation", ","], ["variable", "$2"]]);
});

test("PostgreSQL treats # as an operator instead of a line comment", () => {
  assert.deepEqual(spans(postgresql, "a # b"), [["identifier", "a"], ["operator", "#"], ["identifier", "b"]]);
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

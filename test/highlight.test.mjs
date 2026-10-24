import light from "../packages/terminal/dist/themes/light.js";
import dark from "../packages/terminal/dist/themes/dark.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {highlight,tokenize,resolveLanguage} from "../packages/enlumine/dist/index.js";

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, "");
const kindOf = (source, fragment, language = "typescript") => {
  const offset = source.indexOf(fragment);
  return tokenize(source, language).find(
    (token) => token.start <= offset && token.end > offset,
  )?.kind;
};

test("every source character belongs to exactly one ordered token", () => {
  const samples = [
    "",
    'const λΩΩ = "🌟";\r\n',
    "/* unfinished",
    "`hello ${`nested ${1}`}`",
    "a / 2 + /[/]/g.test(s)",
    "\0\x1b[31m",
    "123.5e-2 0xff 12n",
  ];
  for (const source of samples)
    for (const language of ["javascript", "typescript", "json", "plain"]) {
      const tokens = tokenize(source, language);
      let end = 0;
      for (const token of tokens) {
        assert.equal(token.start, end);
        assert.ok(token.end > token.start);
        end = token.end;
      }
      assert.equal(end, source.length);
      assert.equal(
        tokens.map((token) => source.slice(token.start, token.end)).join(""),
        source,
      );
    }
});

test("comments, escaped quotes, numbers, and keywords receive distinct styles", () => {
  const source =
    'const word = "escaped \\" quote"; /* two\nlines */ const count = 0xFF + 1e-3;';
  assert.equal(kindOf(source, "const"), "keyword");
  assert.equal(kindOf(source, "quote"), "string");
  assert.equal(kindOf(source, "lines"), "comment");
  assert.equal(kindOf(source, "0xFF"), "number");
  assert.equal(kindOf(source, "1e-3"), "number");
});

test("nested template interpolation returns to the enclosing string", () => {
  const source = "`outer ${ { value: `inner ${true}` } } tail`";
  assert.equal(kindOf(source, "outer"), "string");
  assert.equal(kindOf(source, "value"), "property");
  assert.equal(kindOf(source, "inner"), "string");
  assert.equal(kindOf(source, "true"), "literal");
  assert.equal(kindOf(source, "tail"), "string");
});

test("division and regular expressions in expression position differ", () => {
  const source = "const n = a / 2; const r = /a[\\/]b/g;";
  assert.equal(kindOf(source, "/ 2"), "operator");
  assert.equal(kindOf(source, "/a"), "string");
});

test("JSON strings and literals are recognized without JavaScript comments", () => {
  const source = '{"name": "enlumine", "enabled": true, "n": -1.5e+2}';
  assert.equal(kindOf(source, "name", "json"), "string");
  assert.equal(kindOf(source, "true", "json"), "literal");
  assert.equal(kindOf(source, "1.5", "json"), "number");
  assert.ok(
    !tokenize("// text", "json").some((token) => token.kind === "comment"),
  );
});

test("ANSI output preserves Unicode, tabs, line endings, and final newline status", () => {
  for (const source of [
    "",
    'const λΩΩ = "🌟";\r\n\t/* a\nb */',
    '"hello"\n',
    '"hello"',
  ]) {
    for (const colorLevel of [0, 1, 2, 3]) {
      assert.equal(
        strip(highlight(source, {theme:dark, lang: "ts", colorLevel })),
        source,
      );
    }
  }
});

test("each colored line resets before its terminator or end of output", () => {
  assert.equal(
    highlight("/* a\r\nb */\n", {theme:dark, lang: "js" }),
    "\x1b[38;2;127;140;152m/* a\x1b[39m\r\n\x1b[38;2;127;140;152mb */\x1b[39m\n",
  );
  assert.equal(highlight("const", {theme:dark, lang: "ts" }).endsWith("\x1b[39m"), true);
});

test("color modes produce terminal escape sequences for their selected depth", () => {
  assert.match(
    highlight("const", {theme:dark, lang: "ts", colorLevel: 1 }),
    /^\x1b\[(?:3|9)\dm/,
  );
  assert.match(
    highlight("const", {theme:dark, lang: "ts", colorLevel: 2 }),
    /^\x1b\[38;5;\d+m/,
  );
  assert.match(
    highlight("const", { lang: "ts", colorLevel: 3, theme: light }),
    /^\x1b\[38;2;/,
  );
  assert.equal(highlight("const", {theme:dark, lang: "ts", colorLevel: 0 }), "const");
});

test("source terminal control sequences are displayed as visible text", () => {
  const source = "\x1b]52;c;payload\x07\x1b[31m";
  assert.equal(
    highlight(source, {theme:dark, lang: "plain" }),
    "\\x1b]52;c;payload\\x07\\x1b[31m",
  );
});

test("invalid language, color, and theme values fail explicitly", () => {
  assert.equal(resolveLanguage("TS"), "typescript");
  assert.throws(
    () => highlight("x", {theme:dark, lang: "missing" }),
    /Unsupported language/,
  );
  assert.throws(
    () => highlight("x", {theme:dark, lang: "ts", colorLevel: 4 }),
    /Invalid color/,
  );
  assert.throws(
    () => highlight("x", { lang: "ts", theme: { keyword: "#xyz" } }),
    /Expected #rrggbb/,
  );
});

test("custom theme mutations apply on the next call", () => {
  const theme = { keyword: "#123456" };
  assert.match(highlight("const", { lang: "ts", theme }), /38;2;18;52;86m/);
  theme.keyword = "#abcdef";
  assert.match(highlight("const", { lang: "ts", theme }), /38;2;171;205;239m/);
});

test("plain text can be styled and token arrays survive later calls", () => {
  assert.equal(
    highlight("hello", { lang: "plain", theme: { plain: "#ffffff" } }),
    "\x1b[38;2;255;255;255mhello\x1b[39m",
  );
  const tokens = tokenize("const a = 1", "typescript");
  const copy = structuredClone(tokens);
  highlight("/* different */", {theme:dark, lang: "ts" });
  tokenize('"other"', "json");
  assert.deepEqual(tokens, copy);
});

function cli(args, input, extraEnv = {}) {
  const env = { ...process.env };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  return spawnSync(process.execPath, ["packages/enlumine/dist/cli.js", ...args], {
    input,
    encoding: "utf8",
    env: { ...env, ...extraEnv },
  });
}

test("CLI accepts stdin and disables color when piped", () => {
  const result = cli(["--lang", "ts"], "const answer = 42;\n");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "const answer = 42;\n");
});

test("CLI honors NO_COLOR and explicit color settings", () => {
  assert.equal(
    cli(["-l", "ts"], "const", { NO_COLOR: "1", FORCE_COLOR: "3" }).stdout,
    "const",
  );
  assert.match(
    cli(["-l", "ts", "--color", "truecolor"], "const", { NO_COLOR: "1" })
      .stdout,
    /\x1b\[38;2;/,
  );
});

test("CLI reads files and reports unsupported explicit languages", () => {
  const result = cli(["package.json", "--color", "truecolor"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\x1b\[38;2;/);
  const invalid = cli(["--lang", "rust"], "fn main() {}");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unsupported language: rust/);
});

test("CLI detects SQL and GraphQL file extensions", async () => {
  for (const name of ["query.sql", "query.graphql"]) {
    const path = `test/fixtures/${name}`;
    const result = cli([path, "--color", "truecolor"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\x1b\[38;2;/);
    assert.equal(strip(result.stdout), await readFile(path, "utf8"));
  }
});

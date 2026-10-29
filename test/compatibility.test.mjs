import dark from "../packages/terminal/dist/themes/dark.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { highlight, resolveLanguage } from "../packages/enlumine/dist/index.js";
import { sameTables, dollarQuoteDiffersFromUpstream } from "../scripts/token-tables.mjs";

const fixtures = {
  json: [
    '{"name":"ΩΩ 🌟","values":[1,-2.5e3,true,false,null]}',
    '{"escaped":"a\\\"b\\u1234"}',
    '{"unfinished":"hello',
    "",
    "\0\r\n",
  ],
  typescript: [
    "export async function greet<T extends {name: string}>(value: T): Promise<string> { return `Hello ${value.name}`; }",
    "`outer ${ { value: `inner ${true}` } } tail`",
    "/a[\\/]b/g.test(text); value / 2; const n = 0xffn;",
    "/** @param {string} name */\nconst greet = (name: string) => name;",
    'const λΩΩ = "🌟"; /* unfinished',
    'interface User { id: string; getName(): string }\nconst user: User = {id: "a", getName() { return this.id }};',
    "const sql = sql`SELECT name FROM users WHERE id = ${id}`;",
    'const a = 1;\r\n\t// comment\rconst b = "x";',
    'const t = html`<div class="a">${x}<script>let a = 1;</script><style>b{c:d}</style></div>`;',
    "const s = css`.a { color: red; ${b}: 1px } @media (min-width: 1px) { .c { margin: 0 } }`;",
    '@Component({selector: "x"}) abstract class C<T extends B = D> implements F { @Input() a!: string; constructor(public x: number) { super(); } }',
    "<{y<z><>(w",
    "x<y}{>(z); f<T}{>(w)",
    "{ m<T>x>(a) { } } class C { n<A>=>(b) {} }",
    "enum E { A = 1, B = A << 1 } type U = { [K in keyof T as `on${string & K}`]?: T[K] } & Partial<Record<string, readonly [a: 1, ...b: 2[]]>>;",
    "",
  ],
  sql: [
    "SELECT u.id, COUNT(*) AS total FROM users u WHERE u.active = TRUE GROUP BY u.id;",
    "select 'it''s fine', $$hello 🌟$$, $tag$body$tag$, 1.5e-2; -- comment\r\n",
    "select 'it''s fine', $$hello 🌟$$, 1.5e-2; -- comment\r\n",
    "WITH sample AS (SELECT 1) SELECT * FROM sample; /* outer /* inner */ end */",
    "CREATE TABLE users (id UUID PRIMARY KEY, name TEXT NOT NULL);",
    'SELECT "λΩΩ", [column], `name`, :name, $1, @var;',
    "SELECT 'unfinished",
    "",
  ],
  graphql: [
    "query GetUser($id: ID!) { user(id: $id) { id name ...Fields } } fragment Fields on User { email }",
    'type User implements Node { id: ID! name: String @deprecated(reason: "old") }',
    "mutation { update(input: {enabled: true, value: null, score: -1.5e3}) { id } }",
    '"""block\nΩΩ 🌟\n"""\ntype Query { hello: String } # comment',
    'query { field(arg: "unfinished',
    "",
  ],
};

let seed = 1729;
function random(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
const fragments = [
  " ",
  "\n",
  "\r\n",
  "\t",
  "a",
  "λΩΩ",
  "🌟",
  "123",
  '"',
  "'",
  "`",
  "${",
  "}",
  "{",
  "/",
  "/*",
  "*/",
  "//",
  "#",
  "$",
  ":",
  ";",
  "(",
  ")",
  "[",
  "]",
  "<",
  ">",
  "=",
  "\\",
  "true",
  "const",
  "SELECT",
  "query",
];

for (const [language, samples] of Object.entries(fixtures)) {
  test(`${language}: generated runtime matches upstream token ranges and classifications`, async () => {
    const reference = (await import(`@twinkleplop/${language}`)).tokenize();
    const runtime = (await import(`../packages/${language}/dist/index.js`)).default;
    const inputs = [...samples];
    if (language === "typescript")
      inputs.push(
        await readFile(new URL("../packages/core/src/core.ts", import.meta.url), "utf8"),
      );
    for (let i = 0; i < 100; i++) {
      let source = "";
      for (let j = 0, length = random(35); j < length; j++)
        source += fragments[random(fragments.length)];
      inputs.push(source);
    }
    for (const source of inputs) {
      const expected = reference(source);
      const actual = runtime(source);
      // Upstream does not know PostgreSQL's tagged dollar quoting ($tag$ ... $tag$) or that a $ after a non-ASCII letter continues an identifier; sql-dialects.test.mjs pins ours.
      if (language === "sql" && dollarQuoteDiffersFromUpstream(actual, source)) continue;
      if (language === "typescript") assert.ok(sameTables(actual, expected, source), JSON.stringify({ language, source }));
      else {
        assert.deepEqual(actual.tokens, expected.tokens, JSON.stringify({ language, source }));
        assert.deepEqual(actual.token_types, expected.token_types, JSON.stringify({ language, source }));
      }
      const rendered = highlight(source, {theme:dark, lang: language });
      const visible = source.replace(
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g,
        (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
      );
      assert.equal(rendered.replace(/\x1b\[[0-9;]*m/g, ""), visible);
    }
  });
}

test("SQL and GraphQL aliases are supported", () => {
  assert.equal(resolveLanguage("SQL"), "sql");
  assert.equal(resolveLanguage("gql"), "graphql");
  assert.match(highlight("SELECT name FROM users", {theme:dark, lang: "sql" }), /\x1b\[/);
  assert.match(
    highlight("query { viewer { id } }", {theme:dark, lang: "graphql" }),
    /\x1b\[/,
  );
});

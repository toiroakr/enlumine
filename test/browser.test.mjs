import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { tokenize } from "../packages/core/dist/index.js";
import json from "../packages/json/dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = '{"name": "Ω", "ok": true, "n": [1, -2.5e3, null]}';

async function importBrowserBundle(contents, run) {
  const result = await build({
    stdin: { contents, resolveDir: fileURLToPath(new URL("../packages/json/", import.meta.url)) },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    tsconfigRaw: {},
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  const directory = await mkdtemp(join(tmpdir(), "enlumine-browser-"));
  try {
    const file = join(directory, "bundle.mjs");
    await writeFile(file, code);
    return await run(await import(pathToFileURL(file).href), code);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("core and json bundle for the browser without Node built-ins", async () => {
  await importBrowserBundle(
    `import { tokenize } from "@enlumine/core";
     import json from "@enlumine/json";
     export const tokens = tokenize(${JSON.stringify(source)}, json);`,
    (bundled, code) => {
      assert.doesNotMatch(code, /node:/);
      assert.deepEqual(bundled.tokens, tokenize(source, json));
    },
  );
});

test("the browser build of core fails with a clear message only when a packed grammar is loaded", async () => {
  await importBrowserBundle(
    `import { loadGrammar } from "@enlumine/core";
     export const load = () => loadGrammar("AAAA");`,
    (bundled) => assert.throws(() => bundled.load(), /Node\.js/),
  );
});

test("the browser build of core exports the same names as the Node build", async () => {
  const node = await import("../packages/core/dist/index.js");
  const browser = await import("../packages/core/dist/browser.js");

  assert.deepEqual(Object.keys(browser).sort(), Object.keys(node).sort());
});

test("the SQL tokenizers and the GraphQL lexical entry bundle for the browser and match the Node build", async () => {
  const nodeSql = (await import("../packages/sql/dist/index.js")).default;
  const nodePostgresql = (await import("../packages/sql/dist/postgresql/index.js")).default;
  const nodeLines = (await import("../packages/graphql/dist/lexical.js")).tokenizeLines;

  await importBrowserBundle(
    `import sql from ${JSON.stringify(`${root}packages/sql/dist/index.js`)};
     import postgresql from ${JSON.stringify(`${root}packages/sql/dist/postgresql/index.js`)};
     import { tokenizeLines } from ${JSON.stringify(`${root}packages/graphql/dist/lexical.js`)};
     export const results = {
       sql: sql("SELECT 1"),
       postgresql: postgresql("SELECT 1"),
       graphql: tokenizeLines(["field(arg: 1)"]),
     };`,
    (bundled, code) => {
      assert.doesNotMatch(code, /node:/);
      assert.deepEqual(bundled.results, {
        sql: nodeSql("SELECT 1"),
        postgresql: nodePostgresql("SELECT 1"),
        graphql: nodeLines(["field(arg: 1)"]),
      });
    },
  );
});

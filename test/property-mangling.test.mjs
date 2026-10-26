import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { brotliCompressSync } from "node:zlib";
import { minify } from "terser";
import { propertyMangling } from "../scripts/property-mangling.mjs";

const coreDist = await mkdtemp(join(tmpdir(), "enlumine-core-"));
await writeFile(join(coreDist, "index.js"), "export const run = g => g.core_field;");
const payload = brotliCompressSync(Buffer.from(JSON.stringify({ kind: "payload_value", payload_key: 1, filler: randomBytes(300).toString("hex") }))).toString("base64");
const source = `const grammar = load("${payload}");
export const result = { own_field: 1, core_field: 2, payload_value: 3, payload_key: 4, tokens: 5, token_types: 6, quoted_name: 7, plain: grammar };
export const lookup = key => result[key] ?? result.quoted_name ?? "quoted_name";`;

test("internal property names are shortened unless a string, the core package, or the grammar data can reach them", async () => {
  const { code } = await minify(source, { module: true, mangle: await propertyMangling(source, coreDist), compress: false });
  assert.doesNotMatch(code, /own_field/);
  for (const name of ["core_field", "payload_value", "payload_key", "tokens", "token_types", "quoted_name"])
    assert.match(code, new RegExp(name));
});

import { readdir, readFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";

const internal = /^([a-z]+(_[a-z0-9]+)+|__[a-z]+)$/;

export async function propertyMangling(code, coreDist) {
  const reserved = new Set(["tokens", "token_types"]);
  for (const file of (await readdir(coreDist)).filter(name => name.endsWith(".js")))
    for (const [, name] of (await readFile(`${coreDist}/${file}`, "utf8")).matchAll(/[.{,]([\w$]+)(?=[:=.\[,)}(;\s])/g)) reserved.add(name);
  for (const [, , text] of code.matchAll(/(["'])((?:(?!\1)[^\\\n])*)\1/g)) reserved.add(text);
  for (const [, encoded] of code.matchAll(/"([A-Za-z0-9+/=]{200,})"/g)) {
    let json;
    try { json = brotliDecompressSync(Buffer.from(encoded, "base64")).toString(); } catch { continue; }
    for (const [, text] of json.matchAll(/"([^"\\]*)"/g)) reserved.add(text);
  }
  return { properties: { regex: internal, reserved: [...reserved] } };
}

import {grammar} from "@twinkleplop/json";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export async function jsonLexicalData() {
  const signature=createHash("sha256").update(JSON.stringify(grammar,(_key,value)=>
    ArrayBuffer.isView(value)?Array.from(value):value instanceof Map?[...value]:value)).digest("hex");
  const names=["string","boolean","keyword","punctuation","number","string_escape"];
  if(signature!=="4572d55cb6d21ee093fa7e705f59ef5be1e05bac7f73c451998f2ab8329b871c"||
      JSON.stringify(grammar.token_types)!==JSON.stringify(names))
    throw new Error("JSON grammar changed; update the lexical adapter and run compatibility checks");
  const packageRoot=resolve(fileURLToPath(import.meta.resolve("@twinkleplop/json")),"../..");
  const manifest=JSON.parse(await readFile(resolve(packageRoot,"package.json"),"utf8"));
  return {
    contents:`export const tokenTypes=${JSON.stringify(names)};`,
    packageName:manifest.name,
    notice:`${manifest.name}@${manifest.version}\n${await readFile(resolve(packageRoot,"LICENSE"),"utf8")}`,
    metadata:{engine:"json-lexical",upstreamVersion:manifest.version,grammarSha256:signature},
  };
}

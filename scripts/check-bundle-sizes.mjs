import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root=fileURLToPath(new URL("../",import.meta.url));
const directory=`${root}.generated/size-floor`;
const languages=["json","typescript","sql","graphql"];
await mkdir(directory,{recursive:true});
const rows=[];
for(let mask=1;mask<1<<languages.length;mask++) {
  const selected=languages.filter((_,i)=>mask&(1<<i));
  const engines={};
  for(const engine of ["twinkleplop","enlumine"]) {
    const source=selected.map((language,i)=>engine==="twinkleplop"
      ?`import {tokenize as t${i}} from '@twinkleplop/${language}';`
      :`import t${i} from './packages/${language}/dist/index.js';`).join("\n")+
      `export const lexers={${selected.map((name,i)=>`${name}:t${i}${engine==="twinkleplop"?"()":""}`).join(",")}};`;
    const outfile=`${directory}/${mask}-${engine}.mjs`;
    const result=await build({stdin:{contents:source,resolveDir:root},outfile,write:false,bundle:true,minify:true,platform:"node",format:"esm",target:"node22",tsconfigRaw:{compilerOptions:{}}});
    const code=result.outputFiles[0].contents;
    await writeFile(outfile,code);
    engines[engine]={bytes:code.length,gzipBytes:gzipSync(code,{level:9}).length};
  }
  rows.push({languages:selected,...engines});
}
const failures=rows.filter(row=>row.enlumine.bytes>=row.twinkleplop.bytes||row.enlumine.gzipBytes>=row.twinkleplop.gzipBytes);
const fixtures={json:'{"name":"ΩΩ","active":true,"count":42}',typescript:'export function greet<T>(x:T):T{return x;}',sql:'SELECT COUNT(*) FROM users WHERE active = TRUE;',graphql:'query User($id: ID!) { user(id:$id) { id name } }'};
const upstream=(await import(pathToFileURL(`${directory}/15-twinkleplop.mjs`).href)).lexers;
const current=(await import(pathToFileURL(`${directory}/15-enlumine.mjs`).href)).lexers;
const tables=({tokens,token_types})=>({tokens,token_types});
for(const language of languages) for(let i=0;i<=fixtures[language].length;i++)
  assert.deepEqual(tables(current[language](fixtures[language].slice(0,i))),tables(upstream[language](fixtures[language].slice(0,i))),`${language}: prefix ${i}`);
await writeFile(`${directory}/results.json`,JSON.stringify({
  method:"Pinned public default tokenizer APIs, identical esbuild 0.28.2 ESM/node22/minify options, including dependencies; all 15 nonempty combinations of the four supported languages. Minified bytes and gzip9 must both be strictly smaller than twinkleplop. Token tables and ranges checked on every prefix of four language snippets.",
  reference:Object.fromEntries(await Promise.all(["core",...languages].map(async name=>[name,JSON.parse(await readFile(`${root}node_modules/@twinkleplop/${name}/package.json`,"utf8")).version]))),
  rows,failures,
},null,2)+"\n");
console.table(rows.map(row=>({languages:row.languages.join("+"),twinkleplop:row.twinkleplop.gzipBytes,enlumine:row.enlumine.gzipBytes})));
assert.equal(failures.length,0,`Size floor failed for ${failures.map(row=>row.languages.join("+")).join(", ")}`);

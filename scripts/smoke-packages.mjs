import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const packages = ["core", "json", "typescript", "sql", "graphql", "terminal", "enlumine"];
const destination = resolve(root, ".generated/tarballs");
await mkdir(destination, { recursive: true });
function run(command, args, cwd, input) {
  const result = spawnSync(command, args, { cwd, input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
const manifests = new Map(await Promise.all(packages.map(async name => [name,
  JSON.parse(await readFile(resolve(root, "packages", name, "package.json"), "utf8")),
])));
const versions = new Map([...manifests.values()].map(manifest => [manifest.name, manifest.version]));
const archives = new Map();
for (const name of packages) {
  run("pnpm", ["pack", "--pack-destination", destination], resolve(root, "packages", name));
  const archive = resolve(destination, `${name === "enlumine" ? name : `enlumine-${name}`}-${manifests.get(name).version}.tgz`);
  const manifest = JSON.parse(run("tar", ["-xOf", archive, "package/package.json"], root));
  for (const [dependency, version] of Object.entries(manifest.dependencies ?? {})) {
    assert.ok(dependency.startsWith("@enlumine/"));
    assert.equal(version, versions.get(dependency));
  }
  archives.set(name, archive);
}
const consumer = await mkdtemp(resolve(tmpdir(), "enlumine-packages-"));
try {
  const minimal = resolve(consumer, "minimal");
  await mkdir(minimal);
  await writeFile(resolve(minimal, "package.json"), '{"private":true,"type":"module"}');
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...["core", "sql", "graphql"].map(name => archives.get(name))], minimal);
  const minimalSource = `
    import assert from 'node:assert/strict';
    import * as sqlModule from '@enlumine/sql';
    import {tokenizeLines as sqlLines} from '@enlumine/sql';
    import * as postgresqlModule from '@enlumine/sql/postgresql';
    import {tokenizeLines as postgresqlLines} from '@enlumine/sql/postgresql';
    import {tokenizeLexically, tokenizeLines as graphqlLines} from '@enlumine/graphql/lexical';
    const kinds = ({tokens, token_types}) => Array.from({length: tokens.length / 3}, (_, i) => token_types[tokens[i * 3]]);
    assert.deepEqual(Object.keys(sqlModule).sort(),['default','tokenizeLines']);
    assert.deepEqual(Object.keys(postgresqlModule).sort(),['default','tokenizeLines']);
    assert.ok(!kinds(postgresqlLines(["SELECT '\\\\'", 'FROM t'])[1]).includes('string'));
    assert.deepEqual(kinds(sqlLines(['SELECT 1 /* comment', 'end */'])[1]), ['comment']);
    assert.ok(kinds(graphqlLines(['field(arg: "unfinished'])[0]).includes('string'));
    assert.ok(kinds(graphqlLines(['field(arg: "ΩΩ🌟")'])[0]).includes('string'));
    assert.ok(tokenizeLexically('"ΩΩ🌟"'));
    assert.equal(tokenizeLexically('"'+String.fromCharCode(0xd800)+'"'),undefined);
    for (const name of ['enlumine','@enlumine/typescript','@enlumine/json','@enlumine/terminal','@twinkleplop/core'])
      assert.throws(() => import.meta.resolve(name), {code:'ERR_MODULE_NOT_FOUND'});
  `;
  run(process.execPath, ["--input-type=module", "-e", minimalSource], minimal);
  await writeFile(resolve(minimal, "consumer.mts"), `
    import sql, {tokenizeLines as sqlLines} from '@enlumine/sql';
    import postgresql, {tokenizeLines as postgresqlLines} from '@enlumine/sql/postgresql';
    import {tokenizeLines as graphqlLines} from '@enlumine/graphql/lexical';
    sql('SELECT 1').tokens.slice();
    postgresql('SELECT 1').tokens.slice();
    sqlLines(['SELECT 1'])[0].tokens.slice();
    postgresqlLines(['SELECT 1'])[0].tokens.slice();
    graphqlLines(['field'])[0].token_types.slice();
  `);
  run(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.mts"], minimal);
  await writeFile(resolve(consumer, "package.json"), '{"private":true,"type":"module"}');
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...["core", "json", "terminal"].map(name => archives.get(name))], consumer);
  run(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import tokenizeJson from '@enlumine/json';
    import { highlight } from '@enlumine/terminal';
    import dark from '@enlumine/terminal/themes/dark';
    import { tokenize } from '@enlumine/core';
    const source = '{"active":true,"count":42}';
    assert.ok(highlight(source, {theme:dark,tokenizer:tokenizeJson}).includes('\\x1b['));
    assert.equal(highlight(source, {theme:dark,tokenizer:tokenizeJson,colorLevel:0}), source);
    assert.equal(tokenize(source, tokenizeJson).at(-1).end, source.length);
    for (const name of ['typescript','sql','graphql'])
      assert.throws(() => import.meta.resolve('@enlumine/'+name), {code:'ERR_MODULE_NOT_FOUND'});
    assert.throws(() => import.meta.resolve('@twinkleplop/core'), {code:'ERR_MODULE_NOT_FOUND'});
  `], consumer);
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...archives.values()], consumer);
  const output = run(resolve(consumer, "node_modules/.bin/enlumine"), ["-l", "sql", "--color", "truecolor"], consumer, "SELECT 42;\n");
  assert.ok(output.includes("\x1b["));
  assert.equal(output.replace(/\x1b\[[0-9;]*m/g, ""), "SELECT 42;\n");
  const source = `
    import { highlight as render, highlightLines } from '@enlumine/terminal';
    import { highlight } from 'enlumine';
    import dark from '@enlumine/terminal/themes/dark';
    import ansi from '@enlumine/terminal/themes/ansi';
    import { tokenize, type Tokenizer } from '@enlumine/core';
    import json from '@enlumine/json';
    import typescript from '@enlumine/typescript';
    import sql, { tokenizeLines as sqlLines } from '@enlumine/sql';
    import graphql, { tokenizeFragment, type FragmentContext } from '@enlumine/graphql';
    import { tokenizeLexically, tokenizeLines as graphqlLines } from '@enlumine/graphql/lexical';
    const lexers: Tokenizer[] = [json, typescript, sql, graphql];
    for (const tokenizer of lexers) {
      render('42', {theme:dark,tokenizer, colorLevel: 2});
      tokenize('42', tokenizer);
    }
    highlight('42', {theme:dark,lang:'json'});
    highlightLines(['SELECT 1 /* comment', 'end */'], {tokenizeLines: sqlLines, styles: ansi.sql});
    highlightLines(['query { field(arg: "unfinished'], {tokenizeLines: graphqlLines, styles: ansi.graphql});
    const context: FragmentContext = 'selection';
    tokenizeFragment('user(id: $id) { name }', context);
    const lexical = tokenizeLexically('user(id: $id)');
    if (lexical) lexical.tokens.slice();
  `;
  await writeFile(resolve(consumer, "consumer.mts"), source);
  run(process.execPath, [resolve(root, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "consumer.mts"], consumer);
  run(process.execPath,["--input-type=module","-e",`
    import assert from 'node:assert/strict';
    import {tokenizeFragment} from '@enlumine/graphql';
    import {tokenizeLexically, tokenizeLines} from '@enlumine/graphql/lexical';
    import {highlightLines} from '@enlumine/terminal';
    import ansi from '@enlumine/terminal/themes/ansi';
    const source='user(id: $id) { name }';
    const result=tokenizeFragment(source);
    assert.equal(result.token_types[result.tokens[0]],'property');
    assert.equal(source.slice(result.tokens[1],result.tokens[2]),'user');
    assert.throws(()=>tokenizeFragment(source,'constructor'),RangeError);
    assert.equal(tokenizeLexically('"unfinished'),undefined);
    assert.equal(tokenizeLexically('user(id: $id)').token_types[0],'name');
    assert.ok(highlightLines(['query { field(arg: "unfinished'],{tokenizeLines,styles:ansi.graphql})[0].includes('\\x1b[32m"unfinished\\x1b[0m'));
  `],consumer);
  for (const name of ["typescript", "json", "graphql"])
    await rm(resolve(consumer, "node_modules/@enlumine", name), {recursive:true,force:true});
  for (const theme of ["light", "ansi"])
    await rm(resolve(consumer, "node_modules/@enlumine/terminal/dist/themes", `${theme}.js`));
  const cliPath=resolve(consumer, "node_modules/.bin/enlumine");
  assert.match(run(cliPath,["--help"],consumer),/Usage: enlumine/);
  assert.equal(run(cliPath,["-l","ts","--color","never"],consumer,"const answer = 42;"),"const answer = 42;");
  assert.ok(run(cliPath,["-l","sql","--color","truecolor"],consumer,"SELECT 42;").includes("\x1b["));
  for (const name of ["sql", "terminal", "core"])
    await rm(resolve(consumer, "node_modules/@enlumine", name), {recursive:true,force:true});
  assert.match(run(cliPath,["--help"],consumer),/Usage: enlumine/);
  console.log("Packed packages: core + SQL + GraphQL only, isolated JSON + terminal, CLI lazy loading, and public TypeScript declarations passed.");
} finally {
  await rm(consumer, { recursive: true, force: true });
}

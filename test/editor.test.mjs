import ansi from "../packages/terminal/dist/themes/ansi.js";
import {test} from "node:test";
import assert from "node:assert/strict";

import {highlightSqlLines as sqlLines} from "../packages/sql/dist/editor.js";
import {highlightGraphqlLines as graphqlLines} from "../packages/graphql/dist/editor.js";
const highlightSqlLines = (lines, theme) => sqlLines(lines, theme.sql);
const highlightGraphqlLines = (lines, theme) => graphqlLines(lines, theme.graphql);
const strip=source=>source.replace(/\x1b\[[\d;]*m/g,"");

test("GraphQL argument colors survive unmatched closing parentheses and continue across lines",()=>{
  const output=highlightGraphqlLines([
    ") ) field", "( ( argument", ") argument", ") ) field", "( argument", ") field",
  ],ansi);
  for(const index of [0,3,5])assert.ok(output[index].includes("\x1b[94mfield\x1b[0m"));
  for(const index of [1,2,4])assert.ok(output[index].includes("\x1b[3;33margument\x1b[0m"));
});

test("editor distinguishes SQL keywords and GraphQL fields, arguments, variables, and types",()=>{
  const sql=highlightSqlLines(["SELECT id FROM users WHERE id = 1"], ansi)[0];
  for(const expected of ["\x1b[34mSELECT\x1b[0m","\x1b[33mid\x1b[0m","\x1b[33musers\x1b[0m","\x1b[36m1\x1b[0m"])assert.ok(sql.includes(expected));
  const graphql=highlightGraphqlLines(["user(id: ID!, active: $flag)"], ansi)[0];
  for(const expected of ["\x1b[94muser\x1b[0m","\x1b[3;33mid\x1b[0m","\x1b[36mID\x1b[0m","\x1b[35m$\x1b[0m","\x1b[35mflag\x1b[0m"])assert.ok(graphql.includes(expected));
});

test("editor colors unfinished GraphQL strings and preserves colors before incomplete input",()=>{
  for(const text of ['unfinished','ends with \\', 'bad \\u', 'comment # inside']) {
    const source='query Q { user(name: "'+text;
    const output=highlightGraphqlLines([source], ansi)[0];
    assert.equal(strip(output),source);
    assert.ok(output.includes("\x1b[34mquery\x1b[0m"));
    assert.ok(output.includes('\x1b[32m"'+text+'\x1b[0m'));
  }
  const source='query Q { field(arg: 1e';
  assert.ok(highlightGraphqlLines([source], ansi)[0].includes("\x1b[34mquery\x1b[0m"));
});

test("editor colors inline comments and carries nested comments and block strings across lines",()=>{
  const sql=["SELECT 1 /* outer", "/* nested */ continuation", "*/ FROM users -- note"];
  const sqlOutput=highlightSqlLines(sql, ansi);
  assert.deepEqual(sqlOutput.map(strip),sql);
  assert.ok(sqlOutput[1].includes("\x1b[90m/* nested */ continuation\x1b[0m"));
  assert.ok(sqlOutput[2].includes("\x1b[90m-- note\x1b[0m"));
  const graphql=['{ field(a: """doc', 'continuation', 'end""", b: 1) # note', '}'];
  const output=highlightGraphqlLines(graphql, ansi);
  assert.deepEqual(output.map(strip),graphql);
  assert.equal(output[1],"\x1b[32mcontinuation\x1b[0m");
  assert.ok(output[2].includes("\x1b[90m# note\x1b[0m"));
  assert.ok(output[2].includes("\x1b[3;33mb\x1b[0m"));
});

test("editor treats tagged SQL dollar quotes as strings without changing comment state",()=>{
  const lines=['SELECT $body$/* text */$body$ AS value', 'FROM users'];
  const output=highlightSqlLines(lines, ansi);
  assert.deepEqual(output.map(strip),lines);
  assert.ok(output[0].includes("\x1b[92m$body$/* text */$body$\x1b[0m"));
  assert.ok(output[1].includes("\x1b[34mFROM\x1b[0m"));
});

test("escaped triple quotes remain in block strings until the closing delimiter",()=>{
  const lines=[String.raw`{ field(a: """before \""" escaped`, 'after""") { name } }'];
  const output=highlightGraphqlLines(lines,ansi);
  assert.deepEqual(output.map(strip),lines);
  assert.ok(output[0].includes("\x1b[32m"+lines[0].slice(lines[0].indexOf('"""'))+"\x1b[0m"));
  assert.ok(output[1].includes('\x1b[32mafter"""\x1b[0m'));
  assert.ok(output[1].includes("\x1b[94mname\x1b[0m"));
});

test("SQL escaped quotes keep comment markers inside strings",()=>{
  const lines=[String.raw`SELECT E'a\'/* inside' AS value`, 'FROM users'];
  const output=highlightSqlLines(lines,ansi);
  assert.deepEqual(output.map(strip),lines);
  assert.ok(output[0].includes("\x1b[34mAS\x1b[0m"));
  assert.ok(output[1].includes("\x1b[34mFROM\x1b[0m"));
});

test("SQL multiline dollar strings keep comment text literal and resume code after the delimiter",()=>{
  const lines=['SELECT $body$hello', '/* body -- still text', 'world$body$ AS value', 'FROM users'];
  const output=highlightSqlLines(lines,ansi);
  assert.deepEqual(output.map(strip),lines);
  assert.equal(output[1],"\x1b[92m/* body -- still text\x1b[0m");
  assert.ok(output[2].includes("\x1b[92mworld$body$\x1b[0m"));
  assert.ok(output[2].includes("\x1b[34mAS\x1b[0m"));
  assert.ok(output[3].includes("\x1b[34mFROM\x1b[0m"));
});

test("SQL quoted strings and identifiers keep their state across lines",()=>{
  for(const [open,close,color] of [["'","'","92"],['"','"','33'],['`','`','33'],['[',']','33']]) {
    const lines=[`SELECT ${open}hello`, '/* literal -- text', `world${close} AS value`, 'FROM users'];
    const output=highlightSqlLines(lines,ansi);
    assert.deepEqual(output.map(strip),lines);
    assert.equal(output[1],`\x1b[${color}m/* literal -- text\x1b[0m`);
    assert.ok(output[2].includes("\x1b[34mAS\x1b[0m"));
    assert.ok(output[3].includes("\x1b[34mFROM\x1b[0m"));
  }
});

test("GraphQL keyword spellings remain field and argument names in selections",()=>{
  const source='query query { query mutation fragment on type user(query: $id) { name } }';
  const output=highlightGraphqlLines([source],ansi)[0];
  assert.equal(strip(output),source);
  assert.ok(output.includes("\x1b[1;36mquery\x1b[0m"));
  for(const name of ['query','mutation','fragment','on','type'])assert.ok(output.includes(`\x1b[94m${name}\x1b[0m`));
  assert.ok(output.includes("\x1b[3;33mquery\x1b[0m"));
});

test("GraphQL fragment conditions and variable list members are types",()=>{
  const lines=['query Q($ids: [', 'ID!]!) { ... on User { on name } }', 'fragment F on Person { name }'];
  const output=highlightGraphqlLines(lines,ansi);
  assert.deepEqual(output.map(strip),lines);
  for(const [line,name] of [[1,'ID'],[1,'User'],[2,'Person']])assert.ok(output[line].includes(`\x1b[36m${name}\x1b[0m`));
  assert.ok(output[1].includes("\x1b[34mon\x1b[0m"));
  assert.ok(output[1].includes("\x1b[94mon\x1b[0m"));
  assert.ok(output[1].includes("\x1b[94mname\x1b[0m"));
});

test("SQL hash comments do not open block comments on later lines",()=>{
  const lines=['SELECT 1 # /* stays in this line comment', 'FROM users'];
  const output=highlightSqlLines(lines,ansi);
  assert.deepEqual(output.map(strip),lines);
  assert.ok(output[0].includes("\x1b[90m# /* stays in this line comment\x1b[0m"));
  assert.ok(output[1].includes("\x1b[34mFROM\x1b[0m"));
  const operator=highlightSqlLines(["SELECT payload #>> '{key}' FROM users"],ansi)[0];
  assert.ok(operator.includes("\x1b[34mFROM\x1b[0m"));
});

test("GraphQL aliases select fields while schema colons still introduce types",()=>{
  const selection='query Q { alias: user { name } }';
  const query=highlightGraphqlLines([selection],ansi)[0];
  assert.equal(strip(query),selection);
  assert.ok(query.includes("\x1b[94muser\x1b[0m"));
  const schema=highlightGraphqlLines(['type Query { user: User }'],ansi)[0];
  assert.ok(schema.includes("\x1b[36mUser\x1b[0m"));
});

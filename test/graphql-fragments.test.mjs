import { test } from "node:test";
import assert from "node:assert/strict";
import * as graphql from "../packages/graphql/dist/index.js";

function named(source,result) {
  return Array.from({length:result.tokens.length/3},(_,i)=>({
    type:result.token_types[result.tokens[3*i]],start:result.tokens[3*i+1],end:result.tokens[3*i+2],
    text:source.slice(result.tokens[3*i+1],result.tokens[3*i+2]),
  }));
}

test("GraphQL selection fragments classify fields, arguments, and variable references", () => {
  assert.equal(typeof graphql.tokenizeFragment,"function");
  const source="user(id: $id, active: true) { name }";
  const result=graphql.tokenizeFragment(source);
  const named=[];
  for(let i=0;i<result.tokens.length;i+=3) named.push({
    type:result.token_types[result.tokens[i]],text:source.slice(result.tokens[i+1],result.tokens[i+2]),
  });
  for(const text of ["user","id","active","name"])
    assert.ok(named.some(token=>token.text===text&&token.type==="property"),text);
  assert.ok(named.some(token=>token.text==="$id"&&token.type==="variable"));
  assert.ok(named.some(token=>token.text==="true"&&token.type==="boolean"));
});

test("GraphQL fragment contexts reject unknown names", () => {
  for(const context of ["missing","constructor","__proto__"])
    assert.throws(()=>graphql.tokenizeFragment("name",context),RangeError);
});

test("GraphQL fragment contexts agree with the equivalent complete document", () => {
  for(const [context,prefix,source,suffix] of [
    ["selection","query Q {","user(id: $id) { name }","}"],
    ["selection","{","query(id: $id) type { mutation }","}"],
    ["fields","type User {","id: ID! name: String friends(limit: Int = 2): [User!]!","}"],
    ["arguments","{user(","id: $id, name: \"ΩΩ🌟\", active: true",")}"],
    ["definitions","query Q(","$id: ID! $names: [String!] = [\"a\"]","){name}"],
    ["value","{field(arg:","{tags: [A, B], key: $value}",")}"],
  ]) {
    const expected=named(prefix+source+suffix,graphql.default(prefix+source+suffix))
      .filter(token=>token.end>prefix.length&&token.start<prefix.length+source.length)
      .map(token=>{
        const start=Math.max(0,token.start-prefix.length),end=Math.min(source.length,token.end-prefix.length);
        return {...token,start,end,text:source.slice(start,end)};
      });
    assert.deepEqual(named(source,graphql.tokenizeFragment(source,context)),expected,context);
  }
});

test("GraphQL fragments retain owned offsets through malformed and unfinished input", () => {
  const source='user(name: "unfinished ΩΩ';
  const result=graphql.tokenizeFragment(source),copy=structuredClone(result);
  for(const context of ["selection","fields","arguments","definitions","value"])
    for(const input of ["", "}", "))", "} name", "([", "\"unfinished", "$", "...", "\u0080🌟"])
      for(const token of named(input,graphql.tokenizeFragment(input,context)))
        assert.ok(token.start>=0&&token.end<=input.length&&token.start<token.end);
  assert.deepEqual(result,copy);
  assert.ok(named(source,result).some(token=>token.type==="string"&&token.text.includes("ΩΩ")));
});

import {test} from "node:test";
import assert from "node:assert/strict";
import json from "../packages/json/dist/index.js";
import {tokenize} from "@twinkleplop/json";

const reference=tokenize();

test("JSON preserves upstream escapes, numbers, keyword boundaries, and incomplete documents",t=>{
  let count=0;
  const check=source=>{assert.deepEqual(json(source),reference(source),JSON.stringify(source));count++;};
  for(const source of [
    '{"name":"ΩΩ 🌟","enabled":true,"value":null,"items":[1,-2.5e+4]}',
    '"\\u1234\\u12\\u\\U1234\\x\\\\\\\"\\',
    '[--1,1-2,007,1.,1e,1e+,1e-2,-.1,+1]',
    'ttrue ffalse nnull true$ false_ null1 null🌟 nullé nnnn tfnfalse',
    '"line\n\0\ud800\udfff\\u0""next"',
  ])for(let end=0;end<=source.length;end++)check(source.slice(0,end));
  for(let code=0;code<256;code++)for(const prefix of ["",'"','"\\','"\\u',"0","1e","true","false","null","-"])
    for(const suffix of ["","x",'"',"1","true"])check(prefix+String.fromCharCode(code)+suffix);
  const pieces=['"',"\\","\\u","\\U","\\x","true","false","null","TRUE","1","0","-","+",".","e","E","{","}",":",",","[","]","a","n","t","f","\n","\0","ΩΩ","🌟","\ud800","\udfff","$","_"];
  let seed=823;
  for(let i=0;i<50000;i++) {
    let source="";
    for(let j=0;j<20;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source+=pieces[seed%pieces.length];}
    check(source);
  }
  t.diagnostic(`${count} independent upstream packed-token comparisons`);
});

test("JSON returns owned token arrays across scratch growth and oversized inputs",()=>{
  const result=json('{"active":true,"values":[1,2,3]}'),snapshot=structuredClone(result);
  for(const source of ['"'+'ΩΩ'.repeat(40000)+'"','n'.repeat(65536),'[1,2]'.repeat(80000),"",'"\\u1234"'])
    assert.deepEqual(json(source),reference(source));
  assert.deepEqual(result,snapshot);
});

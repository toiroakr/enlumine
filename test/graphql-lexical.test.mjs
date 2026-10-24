import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {Lexer,Source,TokenKind,GraphQLError} from "graphql";
import {tokenizeLexically,scanLexically} from "../packages/graphql/dist/lexical.js";

function reference(source) {
  const lexer=new Lexer(new Source(source)),tokens=[];
  try {
    for(let token=lexer.advance();token.kind!==TokenKind.EOF;token=lexer.advance()) {
      const kind=token.kind===TokenKind.NAME?"name"
        : [TokenKind.INT,TokenKind.FLOAT].includes(token.kind)?"number"
        : [TokenKind.STRING,TokenKind.BLOCK_STRING].includes(token.kind)?"string":"punctuation";
      tokens.push({kind,start:token.start,end:token.end});
    }
    return tokens;
  } catch(error) { if(error instanceof GraphQLError)return;throw error; }
}
function actual(source) {
  const result=tokenizeLexically(source);
  if(!result)return;
  return Array.from({length:result.tokens.length/3},(_,i)=>({
    kind:result.token_types[result.tokens[3*i]],start:result.tokens[3*i+1],end:result.tokens[3*i+2],
  })).filter(token=>token.kind!=="comment");
}
const sources=[
  'query Q($id: ID!) { user(id: $id) { name } }',
  'user(id: ID!, active: $flag)',
  'fragment F on User @skip(if:true) { ...Other } # inline comment\n',
  'type User implements Node & Named { id: ID! }',
  '0 -0 1-2 1.5e-2 -1E+3', '01', '1.', '1e', '1foo', '1_000', '1.2.3',
  '"a""b" "" "ΩΩ🌟"', '"\\u0041"', '"\\uD83D\\uDE00"',
  '"\\u{1F600}"', '"\\u{00000041}"', '"\\u{110000}"', '"\\uD800"', '"\\uDC00"',
  '"\\uD800\\u0000"', '"\\uD800\\u{DC00}"', '"\\uD800\\uDC0G"',
  '"\\u{}"', '"\\q"', '"unfinished', '"line\nbreak"',
  '"\t\0"', '"""line\n\\"""still in string\nend"""', '"""unfinished',
  '#'+String.fromCharCode(0xd800), '"'+String.fromCharCode(0xd800)+'"',
  String.fromCharCode(0xdc00), '\uFEFF query, { name }', '... .. . @@@',
];

test("GraphQL lexical entry matches the official lexer on strings, numbers, Unicode and partial input",()=>{
  for(const source of sources) for(let end=0;end<=source.length;end++)
    assert.deepEqual(actual(source.slice(0,end)),reference(source.slice(0,end)),JSON.stringify(source.slice(0,end)));
});

test("GraphQL lexical entry matches project fixtures and deterministic malformed input",async()=>{
  const folder=new URL("./fixtures/",import.meta.url);
  for(const file of await readdir(folder))if(/\.(graphql|gql|txt)$/.test(file)) {
    const source=await readFile(new URL(file,folder),"utf8");
    assert.deepEqual(actual(source),reference(source),file);
  }
  const chars='ab01-+.eE_\\"\n\r\t{}[]($@!#,:|&=) 🌟';
  let seed=7919;
  for(let i=0;i<300;i++) {
    let source="";
    for(let j=0;j<60;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source+=chars[seed%chars.length];}
    assert.deepEqual(actual(source),reference(source),JSON.stringify(source));
  }
});

test("GraphQL lexical results own their ranges and handle long escaped strings",()=>{
  const source='"'+"\\nΩΩ🌟".repeat(8192)+'"';
  assert.deepEqual(actual(source),reference(source));
  const result=tokenizeLexically("user(id:$id)"),copy=structuredClone(result);
  tokenizeLexically('"another"');
  assert.deepEqual(result,copy);
});

test("GraphQL numeric boundaries match the official lexer across signs, fractions, exponents and suffixes",()=>{
  for(const sign of ["", "-", "+"])
    for(const integer of ["", "0", "00", "01", "1", "12", "99999999999999999999"])
      for(const fraction of ["", ".", ".0", ".01", ".1.2"])
        for(const exponent of ["", "e", "E+", "e-2", "e01", "e2e3"])
          for(const suffix of ["", "a", "_", ".", "-", " ", ":", "é", "\n"]) {
            const source=sign+integer+fraction+exponent+suffix;
            assert.deepEqual(actual(source),reference(source),JSON.stringify(source));
          }
});

test("GraphQL Unicode boundaries match the official lexer in strings, block strings and comments",()=>{
  const units=[0,9,10,13,0xd7ff,0xd800,0xdbff,0xdc00,0xdfff,0xe000,0xffff];
  for(const first of units) for(const second of units) {
    const text=String.fromCharCode(first,second);
    for(const source of [`"${text}"`,`"""${text}"""`,`#${text}`])
      assert.deepEqual(actual(source),reference(source),JSON.stringify(source));
  }
});

test("GraphQL name starts and continuations match the official lexer across byte values",()=>{
  for(let code=0;code<256;code++) {
    const char=String.fromCharCode(code);
    for(const source of [char+"a","a"+char+"b"])
      assert.deepEqual(actual(source),reference(source),JSON.stringify(source));
  }
});

test("GraphQL lexical visitors retain offsets during nested scans and signal partial failure",()=>{
  const source='user(id: $id, name: "outer", other: "more")',seen=[];
  assert.equal(scanLexically(source,(kind,start,end)=>{
    assert.ok(tokenizeLexically('"nested"'));
    seen.push({kind,start,end});
  }),true);
  assert.deepEqual(seen,actual(source));
  const prefix=[];
  assert.equal(scanLexically('user(name:"unfinished',(kind,start,end)=>prefix.push({kind,start,end})),false);
  assert.equal(prefix[0].kind,'name');
  assert.throws(()=>scanLexically('name',()=>{throw new Error('consumer failed');}),/consumer failed/);
});

test("nested scans preserve outer comment and number offsets",()=>{
  const source='field(n: 42) # comment\nother',seen=[];
  assert.equal(scanLexically(source,(kind,start,end)=>{
    assert.ok(tokenizeLexically('# inner\nvalue(n: 1.5)'));
    seen.push({kind,start,end});
  }),true);
  const result=tokenizeLexically(source);
  assert.deepEqual(seen,Array.from({length:result.tokens.length/3},(_,i)=>({
    kind:result.token_types[result.tokens[i*3]],start:result.tokens[i*3+1],end:result.tokens[i*3+2],
  })));
});

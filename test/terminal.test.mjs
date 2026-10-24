import dark from "../packages/terminal/dist/themes/dark.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { highlight } from "../packages/terminal/dist/index.js";

test("normalized string fragments preserve CRLF and escape source controls", () => {
  const tokenizer = () => ({
    tokens:new Uint32Array([0,0,2,1,2,4,0,4,6]),
    token_types:["string","string_escape"],
  });
  assert.equal(highlight("a\r\nb\t\0", {
    tokenizer, theme:{string:"#010203",string_escape:"#ffffff"},
  }), "\x1b[38;2;1;2;3ma\x1b[39m\r\n\x1b[38;2;1;2;3mb\t\\x00\x1b[39m");
});

test("custom tokenizers can change a reused token name table between calls", () => {
  const token_types=["keyword"];
  const tokenizer=()=>({tokens:new Uint32Array([0,0,1]),token_types});
  const theme={keyword:"#010203",string:"#040506"};
  assert.equal(highlight("x",{tokenizer,theme}),"\x1b[38;2;1;2;3mx\x1b[39m");
  token_types[0]="string";
  assert.equal(highlight("x",{tokenizer,theme}),"\x1b[38;2;4;5;6mx\x1b[39m");
});

test("missing token ranges use the configured plain style", () => {
  const tokenizer=()=>({tokens:new Uint32Array([0,1,2]),token_types:["keyword"]});
  assert.equal(highlight(" a ",{tokenizer,theme:{plain:"#010203",keyword:"#040506"}}),
    "\x1b[38;2;1;2;3m \x1b[38;2;4;5;6ma\x1b[38;2;1;2;3m \x1b[39m");
});

test("built-in themes refresh cached styles when token IDs change meaning", () => {
  const token_types=["keyword"];
  const tokenizer=()=>({tokens:new Uint32Array([0,0,1]),token_types});
  assert.equal(highlight("x",{theme:dark,tokenizer}),"\x1b[38;2;199;146;234mx\x1b[39m");
  token_types[0]="string";
  assert.equal(highlight("x",{theme:dark,tokenizer}),"\x1b[38;2;195;232;141mx\x1b[39m");
  token_types[0]="identifier";
  assert.equal(highlight("x",{theme:dark,tokenizer}),"x");
});

test("CRLF crossing different token kinds resets once and C1 controls remain visible", () => {
  const tokenizer=()=>({tokens:new Uint32Array([0,0,2,1,2,5]),token_types:["keyword","string"]});
  assert.equal(highlight("a\r\nb\u0085",{tokenizer,theme:{keyword:"#010203",string:"#040506"}}),
    "\x1b[38;2;1;2;3ma\x1b[39m\r\n\x1b[38;2;4;5;6mb\\x85\x1b[39m");
});

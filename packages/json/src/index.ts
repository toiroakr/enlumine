import type { PackedTokens } from "@enlumine/core";
import { tokenTypes } from "enlumine:json-lexical-data";
const main = /"[^"\\]*"?|(?:true|false|null)(?![\w$])|[\[\]{},:]+|-?\d+(?:\.\d*)?(?:[eE][+-]?\d*)?|-|[^"\d\[\]{},:tfn-]+|[tfn]+(?!rue|alse|ull)|[\s\S]/y;
const body = /\\(?:u[\da-fA-F]{0,4}|[\s\S]?)|[^"\\]+"?|"/y;
let scratch = new Uint32Array(4096);
const tokenize = (source: string): PackedTokens => {
  const size = source.length * 3;
  if (size > scratch.length && size <= 1048576) scratch = new Uint32Array(Math.min(1048576, Math.max(size, scratch.length * 2)));
  const tokens = size <= scratch.length ? scratch : new Uint32Array(size);
  let count = 0;
  let position = 0, inside = false, last = -1;
  while (position < source.length) {
    const start = position, first = source.charCodeAt(position);
    const pattern = inside ? body : main;
    pattern.lastIndex = position;
    pattern.test(source);
    position = pattern.lastIndex;
    let kind: number;
    if (inside) {
      kind = first === 92 ? 5 : 0;
      if (!kind && source.charCodeAt(position - 1) === 34) inside = false;
    } else if (first === 34) {
      kind = 0;
      inside = position === start + 1 || source.charCodeAt(position - 1) !== 34;
    } else if (first === 45 || (first >= 48 && first <= 57)) kind = 4;
    else if (first === 116 || first === 102 || first === 110) {
      if (position === start + 1 || !"aru".includes(source[start + 1])) continue;
      kind = first === 110 ? 2 : 1;
    } else if ("{}[],:".includes(source[start])) kind = 3;
    else continue;
    const end = count - 1;
    if (last === kind && tokens[end] === start) tokens[end] = position;
    else { tokens[count++] = kind; tokens[count++] = start; tokens[count++] = position; }
    last = kind;
  }
  return { tokens: tokens.slice(0, count), token_types: tokenTypes };
};
export default tokenize;

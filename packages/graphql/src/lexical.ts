import type { PackedTokens } from "@enlumine/core";

export type LexicalKind = "name" | "number" | "punctuation" | "comment" | "string";
const kinds: LexicalKind[] = ["name", "number", "punctuation", "comment", "string"];
const quoted = /"(?:[^"\\\r\n]|\\(?:["\\/bfnrt]|u(?:[\da-fA-F]{4}|\{[\da-fA-F]{1,8}\})))*"/y;
const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![.\w])/y;
const lineComment = /[^\r\n]+/y;

function digit(code: number): boolean { return code >= 48 && code <= 57; }
function name(code: number): boolean {
  return code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function unicode(text: string, escapes: boolean): boolean {
  if (!text.isWellFormed()) return false;
  if (escapes) for (let i = 0; (i = text.indexOf("\\", i)) >= 0; i++) {
    if (text[++i] !== "u") continue;
    if (text[i + 1] === "{") {
      const end = text.indexOf("}", i + 2);
      const code = parseInt(text.slice(i + 2, end), 16);
      if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return false;
      i = end;
      continue;
    }
    const code = parseInt(text.slice(i + 1, i + 5), 16);
    i += 4;
    if (code >= 0xd800 && code <= 0xdbff) {
      if (text.slice(i + 1, i + 3) !== "\\u") return false;
      const tail = text.slice(i + 3, i + 7);
      const low = parseInt(tail, 16);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return false;
      i += 6;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export function scanLexically(source: string, visit: (kind: LexicalKind, start: number, end: number) => void): boolean {
  let position = 0;
  while (position < source.length) {
    const start = position;
    const code = source.charCodeAt(position);
    let kind: number;
    if (code === 34) {
      const block = source.startsWith('"""', position);
      if (block) {
        let end = position + 3;
        do {
          end = source.indexOf('"""', end);
          if (end < 0) return false;
          if (source[end - 1] !== "\\") break;
          end += 3;
        } while (true);
        position = end + 3;
      } else {
        quoted.lastIndex = position;
        if (!quoted.test(source)) return false;
        position = quoted.lastIndex;
      }
      if (!unicode(source.slice(start, position), !block)) return false;
      kind = 4;
    } else if (code === 9 || code === 10 || code === 13 || code === 32 || code === 44 || code === 0xfeff) {
      position++;
      continue;
    } else if (name(code)) {
      do { position++; } while (name(source.charCodeAt(position)) || digit(source.charCodeAt(position)));
      kind = 0;
    } else if (digit(code) || code === 45) {
      numeric.lastIndex = position;
      if (!numeric.test(source)) return false;
      position = numeric.lastIndex;
      kind = 1;
    } else if (code === 35) {
      lineComment.lastIndex = position;
      lineComment.test(source);
      position = lineComment.lastIndex;
      if (!unicode(source.slice(start, position), false)) return false;
      kind = 3;
    } else if (code === 46) {
      if (!source.startsWith("...", position)) return false;
      position += 3;
      kind = 2;
    } else if ("!$():=@[]{|}&".includes(source[position])) {
      position++;
      kind = 2;
    } else return false;
    visit(kinds[kind], start, position);
  }
  return true;
}

export function tokenizeLexically(source: string): PackedTokens | undefined {
  const tokens: number[] = [];
  if (!scanLexically(source, (kind, start, end) => { tokens.push(kinds.indexOf(kind), start, end); })) return;
  return { tokens: Uint32Array.from(tokens), token_types: kinds };
}

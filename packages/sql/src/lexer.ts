import type { PackedTokens } from "@enlumine/core";
import { tokenTypes, wordGroups, main, min, max, atProbe, atAtProbe, dollarProbe, Kind, numberPattern } from "enlumine:sql-lexical-data";
export interface Dialect {
  quotes: string;
  punctuation: string;
  backslash: boolean;
  escapePrefix: string;
  hash: boolean;
  sigils: string;
}
export const standard: Dialect = { quotes: "\"", punctuation: "(){},;.", backslash: false, escapePrefix: "", hash: false, sigils: "" };
const enum Escape { None, Backslash, Sequences }
let scratch = new Uint32Array(4096);
const stringBody = /[^'\\]+/y;
const plainBody = /[^']+/y;
const escapeSequence = /\\(?:x[\da-fA-F]{0,2}|u[\da-fA-F]{0,4}|U[\da-fA-F]{0,8}|[0-7]{1,3}|[\s\S]?)/y;
const wordTypes = [Kind.Boolean, Kind.Type, Kind.Keyword];
const words = new Map<string, number>();
for (let group = 0; group < wordGroups.length; group++)
  for (const word of wordGroups[group].split(" ")) words.set(word, wordTypes[group]);
function identifier(code: number): boolean {
  return code === 95 || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}
function lex(source: string, dialect: Dialect): Uint32Array {
  const slots = source.length * 3;
  if (slots > scratch.length && slots <= 1048576)
    scratch = new Uint32Array(Math.min(1048576, Math.max(slots, scratch.length * 2)));
  const tokens = slots <= scratch.length ? scratch : new Uint32Array(slots);
  let count = 0;
  let position = 0, lastType = -1;
  function emit(kind: Kind, start: number, end: number, sealed = false) {
    if (end > start) {
      const type = kind;
      if (!sealed && lastType === type && tokens[count - 1] === start)
        tokens[count - 1] = end;
      else {
        tokens[count++] = type;
        tokens[count++] = start;
        tokens[count++] = end;
      }
      lastType = type;
    }
  }
  function quoted(start: number, openEnd: number, kind: Kind.String | Kind.Identifier | Kind.Bit, escape = Escape.None) {
    const opening = source[openEnd - 1];
    const close = opening === "[" ? "]" : opening;
    let cursor = openEnd;
    emit(kind, start, openEnd, openEnd - start > 1);
    while (cursor < source.length) {
      const begin = cursor;
      if (source[cursor] === close) {
        if (kind !== Kind.Bit && source[cursor + 1] === close) {
          cursor += 2;
          emit(kind === Kind.String ? Kind.StringEscape : kind, begin, cursor, true);
        }
        else {
          emit(kind, begin, ++cursor);
          break;
        }
      }
      else if (kind === Kind.String && escape && source[cursor] === "\\") {
        if (escape === Escape.Sequences) {
          escapeSequence.lastIndex = cursor;
          const escape = escapeSequence.exec(source)![0];
          cursor = escapeSequence.lastIndex;
          emit(Kind.StringEscape, begin, cursor, escape.length > 1 && "xuU".includes(escape[1]));
        }
        else {
          cursor = Math.min(source.length, cursor + 2);
          emit(Kind.StringEscape, begin, cursor);
        }
      }
      else {
        if (kind === Kind.String) {
          const body = escape ? stringBody : plainBody;
          body.lastIndex = cursor;
          body.test(source);
          cursor = body.lastIndex;
        }
        else {
          cursor = source.indexOf(close, cursor);
          if (cursor < 0)
            cursor = source.length;
        }
        emit(kind, begin, cursor);
      }
    }
    return cursor;
  }
  while (position < source.length) {
    const start = position, first = source.charCodeAt(position);
    if (first === 32 || first === 9 || first === 10 || first === 13) {
      position++;
      continue;
    }
    if (identifier(first)) {
      const next = source[position + 1];
      if (next === "'" && "eEnNbBxX".includes(source[start])) {
        emit(Kind.Identifier, start, start + 1);
        position = quoted(start + 1, start + 2, "bBxX".includes(source[start]) ? Kind.Bit : Kind.String,
          dialect.escapePrefix.includes(source[start]) ? Escape.Sequences : dialect.backslash ? Escape.Backslash : Escape.None);
        continue;
      }
      if ((first === 85 || first === 117) && next === "&" && (source[start + 2] === "'" || source[start + 2] === '"')) {
        position = quoted(start, start + 3, source[start + 2] === "'" ? Kind.String : Kind.Identifier, Escape.Backslash);
        continue;
      }
      do {
        position++;
        const next = source.charCodeAt(position);
        if (!(next === 36 || (next >= 48 && next <= 57) || identifier(next)))
          break;
      } while (true);
      emit(Kind.Identifier, start, position);
      continue;
    }
    if (first >= 48 && first <= 57) {
      numberPattern.lastIndex = position;
      numberPattern.test(source);
      position = numberPattern.lastIndex;
      emit(Kind.Number, start, position, position > start + 1 && first === 48 && "xXbBoO".includes(source[start + 1]));
      continue;
    }
    if (dialect.punctuation.includes(source[position])) {
      emit(Kind.Punctuation, start, ++position);
      continue;
    }
    main.lastIndex = position;
    const text = main.exec(source)![0];
    position = main.lastIndex;
    if (text.startsWith("--") || (dialect.hash && first === 35 && text[1] !== ">")) {
      emit(Kind.Comment, start, position, true);
    }
    else if (first === 35 && text[1] !== ">") {
      position = start + 1;
      emit(Kind.Operator, start, position);
    }
    else if (text === "/*") {
      emit(Kind.Comment, start, position, true);
      let depth = 1;
      while (position < source.length && depth) {
        const begin = position;
        if (source.startsWith("/*", position)) {
          depth++;
          position += 2;
          emit(Kind.Comment, begin, position, true);
        }
        else if (source.startsWith("*/", position)) {
          depth--;
          position += 2;
          emit(Kind.Comment, begin, position, true);
        }
        else {
          while (position < source.length && !source.startsWith("/*", position) && !source.startsWith("*/", position))
            position++;
          emit(Kind.Comment, begin, position);
        }
      }
    }
    else if (first === 36 && text.length > 1 && text.endsWith("$")) {
      const close = source.indexOf(text, position);
      emit(Kind.String, start, position, true);
      emit(Kind.String, position, close < 0 ? source.length : close);
      if (close >= 0)
        emit(Kind.String, close, close + text.length, true);
      position = close < 0 ? source.length : close + text.length;
    }
    else if (first === 39 || dialect.quotes.includes(source[start])) {
      position = quoted(start, position, first === 39 ? Kind.String : Kind.Identifier,
        first === 39 && dialect.backslash ? Escape.Backslash : Escape.None);
    }
    else if (first === 36) {
      dollarProbe.lastIndex = start + 1;
      emit(dollarProbe.test(source) ? Kind.Variable : Kind.Operator, start, position);
    }
    else if ((first === 64 || first === 58 || first === 63) && !dialect.sigils.includes(text[0]) && !["@>", "@@", "::", ":=", "?|", "?&"].includes(text)) {
      position = start + 1;
      emit(Kind.Operator, start, position);
    }
    else if (first === 64) {
      const doubled = text.startsWith("@@");
      const probe = doubled ? atAtProbe : atProbe;
      probe.lastIndex = start + (doubled ? 2 : 1);
      emit(text !== "@>" && probe.test(source) ? Kind.Variable : Kind.Operator, start, position, doubled || text === "@>");
    }
    else if (first === 58) {
      emit(text === "::" || text === ":=" ? Kind.Operator : Kind.Variable, start, position, text.length > 1 && (text === "::" || text === ":="));
    }
    else if (first === 63 && text !== "?|" && text !== "?&") {
      emit(Kind.Identifier, start, position);
    }
    else if (text.length > 1 || "+-*/%^=<>!~&|".includes(text)) {
      emit(Kind.Operator, start, position, text.length > 1);
    }
  }
  return tokens.slice(0, count);
}
function tokenizeTokens(source: string, dialect: Dialect): Uint32Array {
  const tokens = lex(source, dialect);
  if (tokens.length && tokenTypes.length === Kind.Keyword) tokenTypes.push("keyword", "boolean", "type");
  const target = Kind.Type + 1;
  for (let i = 0; i < tokens.length; i += 3) {
    if (tokens[i] !== Kind.Identifier) continue;
    const start = tokens[i + 1], end = tokens[i + 2];
    const length = end - start;
    if (length >= min && length <= max) {
      const first = source.charCodeAt(start);
      if (first !== 34 && first !== 96 && first !== 91) {
        const type = words.get(source.slice(start, end).toLowerCase());
        if (type) {
          tokens[i] = type;
          continue;
        }
      }
    }
    const next = i + 3;
    if (next >= tokens.length || tokens[next] !== Kind.Punctuation || source.charCodeAt(tokens[next + 1]) !== 40) continue;
    let depth = 0;
    const limit = Math.min(tokens.length, next + 603);
    search: for (let k = next; k < limit; k += 3) {
      if (tokens[k] !== Kind.Punctuation) continue;
      for (let p = tokens[k + 1]; p < tokens[k + 2]; p++) {
        const code = source.charCodeAt(p);
        if (code === 40) depth++;
        else if (code === 41 && --depth === 0) {
          tokens[i] = target;
          break search;
        }
      }
    }
  }
  return tokens;
}

function tokenize(source: string, dialect: Dialect): PackedTokens {
  const tokens = tokenizeTokens(source, dialect);
  const token_types = tokenTypes.slice();
  token_types.push("function");
  const result = { tokens, token_types, frames: undefined };
  return result;
}

export function createTokenizer(dialect: Dialect) {
  return {
    tokenizeTokens: (source: string) => tokenizeTokens(source, dialect),
    tokenize: (source: string) => tokenize(source, dialect),
  };
}

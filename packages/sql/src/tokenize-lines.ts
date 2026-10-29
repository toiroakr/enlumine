import {tokenTypes} from "enlumine:sql-lexical-data";
import type {PackedTokens} from "@enlumine/core";
import type {Dialect} from "./lexer.js";

type Push = (kind: string, start: number, end: number) => void;

function gaps(source: string, from: number, to: number, offset: number, push: Push) {
  for (const part of source.slice(from, to).matchAll(/\S+/g))
    push("special", offset + from + part.index, offset + from + part.index + part[0].length);
}

function codeSpans(source: string, offset: number, tokenizeTokens: (source: string) => Uint32Array, push: Push) {
  const tokens = tokenizeTokens(source);
  let cursor = 0;
  for (let i = 0; i < tokens.length; i += 3) {
    const start = tokens[i + 1], end = tokens[i + 2];
    gaps(source, cursor, start, offset, push);
    const kind = tokenTypes[tokens[i]] ?? "function";
    if (kind === "punctuation") {
      for (let at = start; at < end; at++)
        if (/\S/.test(source[at])) push("()[]{}".includes(source[at]) ? "bracket" : "punctuation", offset + at, offset + at + 1);
    } else push(kind, offset + start, offset + end);
    cursor = end;
  }
  gaps(source, cursor, source.length, offset, push);
}

function quoteEnd(line: string, from: number, quote: string, escapes: boolean): number {
  let end = from;
  while (end < line.length) {
    if (escapes && line[end] === "\\") end += 2;
    else if (line[end++] === quote) {
      if (line[end] !== quote) return end;
      end++;
    }
  }
  return -1;
}

export function createLineTokenizer(tokenizeTokens: (source: string) => Uint32Array, dialect: Dialect) {
  const markers = new RegExp(`\\/\\*|--${dialect.hash ? "|#(?!>)" : ""}|(?<![\\w$\\u0080-\\uffff])\\$(?:[A-Z_\\u0080-\\uffff][\\w\\u0080-\\uffff]*)?\\$|['${dialect.quotes}]`, "gi");
  return function tokenizeLines(lines: readonly string[]): PackedTokens[] {
    const names: string[] = [];
    let depth = 0, delimiter = "", literalEscapes = false;
    let literalKind = "";
    return lines.map(line => {
      const tokens: number[] = [];
      const push: Push = (kind, start, end) => {
        let id = names.indexOf(kind);
        if (id < 0) id = names.push(kind) - 1;
        tokens.push(id, start, end);
      };
      let start = 0, i = 0;
      const emit = (stop: number, kind: string) => {
        if (start < i) codeSpans(line.slice(start, i), start, tokenizeTokens, push);
        if (i < stop) push(kind, i, stop);
        start = i = stop;
      };
      const takeBlockComment = (from: number) => {
        let j = from;
        while (j < line.length && depth > 0) {
          if (line.startsWith("/*", j)) {
            depth++;
            j += 2;
          } else if (line.startsWith("*/", j)) {
            depth--;
            j += 2;
          } else j++;
        }
        emit(j, "comment");
      };
      while (i < line.length) {
        if (delimiter) {
          const close = delimiter.length === 1 ? quoteEnd(line, i, delimiter, literalEscapes) : line.indexOf(delimiter, i);
          emit(close < 0 ? line.length : close + (delimiter.length === 1 ? 0 : delimiter.length), literalKind);
          if (close >= 0) delimiter = "";
        } else if (depth > 0) takeBlockComment(i);
        else {
          markers.lastIndex = i;
          const marker = markers.exec(line);
          if (!marker) break;
          i = marker.index;
          const text = marker[0];
          if (text === "/*") {
            depth = 1;
            takeBlockComment(i + 2);
          } else if (text === "--" || text === "#") emit(line.length, "comment");
          else {
            const quote = text === "[" ? "]" : text;
            const escapes = text === "'" && (dialect.backslash ||
              (i > 0 && dialect.escapePrefix.includes(line[i - 1]) && !/[\w$]/.test(line[i - 2] ?? "")));
            const close = text.length === 1 ? quoteEnd(line, i + 1, quote, escapes) : line.indexOf(text, i + text.length);
            const end = close < 0 ? line.length : close + (text.length === 1 ? 0 : text.length);
            if (text.length === 1) {
              if (close < 0) {
                delimiter = quote;
                literalEscapes = escapes;
                literalKind = text === "'" ? "string" : "identifier";
              }
              i = end;
            }
            else {
              if (close < 0) { delimiter = text; literalKind = "string"; }
              emit(end, "string");
            }
          }
        }
      }
      if (start < line.length) codeSpans(line.slice(start), start, tokenizeTokens, push);
      return { tokens: Uint32Array.from(tokens), token_types: names };
    });
  };
}

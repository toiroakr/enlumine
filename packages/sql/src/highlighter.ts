import {tokenTypes} from "enlumine:sql-lexical-data";
import type {Dialect} from "./lexer.js";

export type SqlStyles = Readonly<Record<string, string | undefined>>;

const reset = "\x1b[0m";
function paint(text: string, style: string | undefined): string {
  return style ? style + text + reset : text;
}

function sqlGap(text: string, styles: SqlStyles): string {
  return text.replace(/\S+/g, part => paint(part, styles.special));
}

function highlightSqlCode(source: string, styles: SqlStyles, tokenizeTokens: (source: string) => Uint32Array): string {
  const tokens = tokenizeTokens(source);
  let output = "", cursor = 0;
  for (let i = 0; i < tokens.length; i += 3) {
    const start = tokens[i + 1], end = tokens[i + 2];
    output += sqlGap(source.slice(cursor, start), styles);
    const text = source.slice(start, end), kind = tokenTypes[tokens[i]] ?? "function";
    output += kind === "punctuation"
      ? text.replace(/\S/g, char => paint(char, "()[]{}".includes(char) ? styles.bracket : styles.punctuation))
      : paint(text, styles[kind]);
    cursor = end;
  }
  return output + sqlGap(source.slice(cursor), styles);
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

const escapedString = /(?:^|[^\w$])[eE]$/;

export function createHighlighter(tokenizeTokens: (source: string) => Uint32Array, dialect: Dialect) {
  const markers = new RegExp(`\\/\\*|--${dialect.hash ? "|#(?!>)" : ""}|\\$(?:[A-Z_]\\w*)?\\$|['${dialect.quotes.replace(/[\]\\^-]/g, "\\$&")}]`, "gi");
  return function highlightSqlLines(lines: readonly string[], styles: SqlStyles): string[] {
    let depth = 0, delimiter = "", literalEscapes = false;
    let literalStyle: string | undefined;
    return lines.map(line => {
      let output = "", start = 0, i = 0;
      const emit = (stop: number, style: string | undefined) => {
        if (start < i) output += highlightSqlCode(line.slice(start, i), styles, tokenizeTokens);
        if (i < stop) output += paint(line.slice(i, stop), style);
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
        emit(j, styles.comment);
      };
      while (i < line.length) {
        if (delimiter) {
          const close = delimiter.length === 1 ? quoteEnd(line, i, delimiter, literalEscapes) : line.indexOf(delimiter, i);
          emit(close < 0 ? line.length : close + (delimiter.length === 1 ? 0 : delimiter.length), literalStyle);
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
          } else if (text === "--" || text === "#") emit(line.length, styles.comment);
          else {
            const quote = text === "[" ? "]" : text;
            const escapes = text === "'" && (dialect.backslash || escapedString.test(line.slice(0, i)));
            const close = text.length === 1 ? quoteEnd(line, i + 1, quote, escapes) : line.indexOf(text, i + text.length);
            const end = close < 0 ? line.length : close + (text.length === 1 ? 0 : text.length);
            if (text.length === 1) {
              if (close < 0) {
                delimiter = quote;
                literalEscapes = escapes;
                literalStyle = text === "'" ? styles.string : styles.identifier;
              }
              i = end;
            }
            else {
              if (close < 0) { delimiter = text; literalStyle = styles.string; }
              emit(end, styles.string);
            }
          }
        }
      }
      return output + (start < line.length ? highlightSqlCode(line.slice(start), styles, tokenizeTokens) : "");
    });
  };
}

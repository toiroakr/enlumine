import type { LinesTokenizer, PackedTokens } from "@enlumine/core";
import { scanLexically } from "./scan-lexically.js";

type Push = (kind: string, start: number, end: number) => void;
const keyword = /^(query|mutation|subscription|fragment|on|type|input|enum|interface|union|scalar|extend|schema|directive|implements|true|false|null)$/;
const definition = /^(query|mutation|subscription|fragment)$/;

type GraphqlContext = [parenDepth: number, prevText: string, braceDepth: number, schema: boolean];

function classify(source: string, context: GraphqlContext, offset: number, push: Push): void {
  let cursor = 0;
  const valid = scanLexically(source, (kind, start, end) => {
    const text = source.slice(start, end);
    cursor = end;
    let style: string;
    const condition = kind === "name" && text === "on" &&
      (context[1] === "..." || !context[2] && !definition.test(context[1]));
    if (kind === "name") {
      if (!context[2] && !context[0] && !definition.test(context[1]) && keyword.test(text))
        context[3] = !/^(query|mutation|subscription|fragment|on|true|false|null)$/.test(text);
      style = context[1] === "$" ? "variable" : context[1] === "@" ? "decorator"
        : !context[2] && definition.test(context[1]) ? "definition"
        : condition ? "keyword" : context[1] === "...on" ? "type"
        : ((!context[2] || context[0] > 0 && /^(true|false|null)$/.test(text)) && keyword.test(text)) ? "keyword"
        : context[1] === ":" && (context[0] > 0 || context[3]) ? "type" : context[0] > 0 ? "parameter" : "property";
    } else if (kind === "number") style = "number";
    else if (kind === "string") style = "string";
    else {
      if (text === "{") context[2]++;
      if (text === "}" && context[2]) context[2]--;
      if (text === "(") context[0]++;
      if (text === ")" && context[0]) context[0]--;
      style = text === "$" ? "variable" : text === "@" ? "decorator"
        : text === "{" || text === "}" ? "brace"
        : "()[]".includes(text) ? "bracket" : "punctuation";
    }
    push(style, offset + start, offset + end);
    if (text !== "[" || context[1] !== ":") context[1] = condition ? "...on" : text;
  });
  if (valid) return;
  const tail = source.slice(cursor);
  const opening = /^[\t\r\n ,\ufeff]*"/.exec(tail);
  if (!opening) return;
  const start = opening[0].length - 1;
  let end = start + 1;
  while (end < tail.length && tail[end] !== "\r" && tail[end] !== "\n") {
    if (tail[end] === "\\") end = Math.min(tail.length, end + 2);
    else if (tail[end++] === '"') break;
  }
  context[1] = tail.slice(start, end);
  push("string", offset + cursor + start, offset + cursor + end);
}

export const tokenizeLines: LinesTokenizer = (lines: readonly string[]): PackedTokens[] => {
  const names: string[] = [];
  let inBlockString = false;
  const context: GraphqlContext = [0, "", 0, false];
  return lines.map(line => {
    const tokens: number[] = [];
    const push: Push = (kind, start, end) => {
      let id = names.indexOf(kind);
      if (id < 0) id = names.push(kind) - 1;
      tokens.push(id, start, end);
    };
    let start = 0, i = 0;
    const emit = (stop: number, kind: string, isString = false) => {
      if (start < i) classify(line.slice(start, i), context, start, push);
      if (isString) context[1] = line.slice(i, stop);
      if (i < stop) push(kind, i, stop);
      start = i = stop;
    };
    const takeBlockString = (from: number) => {
      let end = line.indexOf('"""', from);
      while (end >= 0 && line[end - 1] === "\\") end = line.indexOf('"""', end + 3);
      inBlockString = end < 0;
      emit(inBlockString ? line.length : end + 3, "string", true);
    };
    while (i < line.length) {
      if (inBlockString) takeBlockString(i);
      else if (line.startsWith('"""', i)) takeBlockString(i + 3);
      else if (line[i] === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
        i = j + 1;
      } else if (line[i] === "#") emit(line.length, "comment");
      else i++;
    }
    if (start < line.length) classify(line.slice(start), context, start, push);
    return { tokens: Uint32Array.from(tokens), token_types: names };
  });
};

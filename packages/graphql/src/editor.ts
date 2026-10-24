import { scanLexically } from "./lexical.js";

export type GraphqlStyles = Readonly<Record<string, string | undefined>>;

const reset = "\x1b[0m";
const keyword = /^(query|mutation|subscription|fragment|on|type|input|enum|interface|union|scalar|extend|schema|directive|implements|true|false|null)$/;
const definition = /^(query|mutation|subscription|fragment)$/;

function paint(text: string, style: string | undefined): string {
  return style ? style + text + reset : text;
}

type GraphqlContext = [parenDepth: number, prevText: string, braceDepth: number, schema: boolean];

function highlightGraphqlCode(source: string, context: GraphqlContext, styles: GraphqlStyles): string {
  let output = "", cursor = 0;
  const valid = scanLexically(source, (kind, start, end) => {
    const text = source.slice(start, end);
    output += source.slice(cursor, start);
    cursor = end;
    let style: string | undefined;
    const condition = kind === "name" && text === "on" &&
      (context[1] === "..." || !context[2] && !definition.test(context[1]));
    if (kind === "name") {
      if (!context[2] && !context[0] && !definition.test(context[1]) && keyword.test(text))
        context[3] = !/^(query|mutation|subscription|fragment|on|true|false|null)$/.test(text);
      style = context[1] === "$" ? styles.variable : context[1] === "@" ? styles.decorator
        : !context[2] && definition.test(context[1]) ? styles.definition
        : condition ? styles.keyword : context[1] === "...on" ? styles.type
        : ((!context[2] || context[0] > 0 && /^(true|false|null)$/.test(text)) && keyword.test(text)) ? styles.keyword
        : context[1] === ":" && (context[0] > 0 || context[3]) ? styles.type : context[0] > 0 ? styles.parameter : styles.property;
    } else if (kind === "number") style = styles.number;
    else if (kind === "string") style = styles.string;
    else {
      if (text === "{") context[2]++;
      if (text === "}" && context[2]) context[2]--;
      if (text === "(") context[0]++;
      if (text === ")" && context[0]) context[0]--;
      style = text === "$" ? styles.variable : text === "@" ? styles.decorator
        : text === "{" || text === "}" ? styles.brace
        : "()[]".includes(text) ? styles.bracket : styles.punctuation;
    }
    output += paint(text, style);
    if (text !== "[" || context[1] !== ":") context[1] = condition ? "...on" : text;
  });
  const tail = source.slice(cursor);
  if (valid) return output + tail;
  const opening = /^[\t\r\n ,\ufeff]*"/.exec(tail);
  if (!opening) return output + tail;
  const start = opening[0].length - 1;
  let end = start + 1;
  while (end < tail.length && tail[end] !== "\r" && tail[end] !== "\n") {
    if (tail[end] === "\\") end = Math.min(tail.length, end + 2);
    else if (tail[end++] === '"') break;
  }
  context[1] = tail.slice(start, end);
  return output + tail.slice(0, start) + paint(tail.slice(start, end), styles.string) + tail.slice(end);
}

export function highlightGraphqlLines(lines: readonly string[], styles: GraphqlStyles): string[] {
  let inBlockString = false;
  const context: GraphqlContext = [0, "", 0, false];
  return lines.map(line => {
    let output = "", start = 0, i = 0;
    const emit = (stop: number, style: string | undefined, isString = false) => {
      if (start < i) output += highlightGraphqlCode(line.slice(start, i), context, styles);
      const text = line.slice(i, stop);
      if (isString) context[1] = text;
      if (i < stop) output += paint(text, style);
      start = i = stop;
    };
    const takeBlockString = (from: number) => {
      let end = line.indexOf('"""', from);
      while (end >= 0 && line[end - 1] === "\\") end = line.indexOf('"""', end + 3);
      inBlockString = end < 0;
      emit(inBlockString ? line.length : end + 3, styles.string, true);
    };
    while (i < line.length) {
      if (inBlockString) takeBlockString(i);
      else if (line.startsWith('"""', i)) takeBlockString(i + 3);
      else if (line[i] === '"') {
        let j = i + 1;
        while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
        i = j + 1;
      } else if (line[i] === "#") emit(line.length, styles.comment);
      else i++;
    }
    return output + (start < line.length ? highlightGraphqlCode(line.slice(start), context, styles) : "");
  });
}

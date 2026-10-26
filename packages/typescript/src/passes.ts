import { closingAngle, follows, typeId, View } from "./claims.js";

export interface Tokens { tokens: Uint32Array; token_types: string[]; frames?: unknown }
export type Pass = (source: string, result: Tokens) => Tokens;

export const typeKeywords: Pass = (source, result) => {
  const { tokens, token_types: types } = result;
  const type = typeId(types, "type"), view = new View(source, tokens, types);
  const retypeBraced = (open: number) => {
    let depth = 0;
    for (const c of view.text(open)) c === "{" ? depth++ : c === "}" && depth--;
    for (let i = open + 1; i < view.count && depth > 0; i++) {
      if (view.is(i, "punctuation")) {
        for (const c of view.text(i)) {
          if (c === "{") depth++;
          else if (c === "}" && --depth === 0) break;
        }
      } else if (view.is(i, "identifier")) tokens[i * 3] = type;
    }
  };
  for (let i = 0; i < view.count; i++) {
    if (!view.is(i, "keyword")) continue;
    const text = view.text(i);
    if (text === "type") {
      const prev = view.prev(i - 1), name = view.next(i + 1);
      if ((prev < 0 || view.is(prev, "keyword", "export", "declare") || view.is(prev, "punctuation") && /[;}]$/.test(view.text(prev))) && view.is(name, "identifier")) tokens[name * 3] = type;
    } else if (text === "import" || text === "export") {
      const marker = view.next(i + 1), target = view.next(marker + 1);
      if (!view.is(marker, "keyword", "type")) continue;
      if (view.starts(target, "punctuation", "{")) retypeBraced(target);
      else if (view.is(target, "identifier")) tokens[target * 3] = type;
    }
  }
  return result;
};

function nextLess(view: View, from: number) {
  for (let i = from; i < view.count; i++) if (view.source[view.tokens[3 * i + 1]] === "<" && view.is(i, "operator", "<")) return i;
  return -1;
}

export const genericCalls: Pass = (source, result) => {
  const { tokens, token_types: types } = result;
  const fn = typeId(types, "function"), view = new View(source, tokens, types);
  for (let i = nextLess(view, 0); i >= 0; i = nextLess(view, i + 1)) {
    const name = view.prev(i - 1), close = view.is(name, "identifier") ? closingAngle(view, i) : -1;
    if (close >= 0 && view.starts(view.next(close + 1), "punctuation", "(")) tokens[name * 3] = fn;
  }
  return result;
};

export const genericShapes: Pass = (source, result) => {
  const { tokens, token_types: types } = result;
  const view = new View(source, tokens, types);
  for (let i = nextLess(view, 0); i >= 0;) {
    const prev = view.prev(i - 1), angles = [i];
    const close = ["identifier", "type", "class_name", "function"].includes(view.type(prev)) ? closingAngle(view, i, angles) : -1;
    if (close >= 0 && follows(view, view.next(close + 1), /^([=|&>?!]|=>|>>>?)$/)) {
      for (const angle of angles) tokens[angle * 3] = types.indexOf("punctuation");
      i = nextLess(view, close + 1);
    } else i = nextLess(view, i + 1);
  }
  return result;
};

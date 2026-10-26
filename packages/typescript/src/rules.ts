import { balancedEnd, functionValue } from "./bindings.js";
import { claim, typeId, View } from "./claims.js";
import type { Pass } from "./passes.js";

export interface Frames {
  frames: { bracket: number; kind: number; enter_idx: number; parent: number }[];
  active_frame: ArrayLike<number>;
  at_start: ArrayLike<number>;
  asi: ArrayLike<number>;
  kind_names: string[];
}

function colon(view: View, at: number) {
  let first = view.next(at);
  if (view.has(first, "operator", "?")) first = view.next(first + 1);
  return view.has(first, "punctuation", ":") ? first + 1 : -1;
}

export const kindMask = (frames: Frames, ...names: string[]) => names.reduce((mask, name) => mask | 1 << frames.kind_names.indexOf(name), 0);

export const inFrame = (frames: Frames, i: number, mask: number) => (mask >> frames.frames[frames.active_frame[i]].kind & 1) === 1;

export const atStartIn = (frames: Frames, i: number, mask: number) => frames.at_start[i] === 1 && inFrame(frames, i, mask);

export const reservedNames: Pass = (source, result) => {
  const frames = result.frames as Frames | undefined;
  if (!frames) return result;
  const { tokens, token_types: types } = result;
  const view = new View(source, tokens, types);
  const hits: [number, string][] = [];
  const usedAsName = (at: number, text: string, next: number) => {
    if (view.has(view.prev(at - 1), "keyword", "function")) return true;
    if (next < 0) return false;
    if (view.is(next, "punctuation")) return ")]},;.:".includes(source[tokens[3 * next + 1]]) || source[tokens[3 * next + 1]] === "(" && callableKeywords.includes(text);
    return view.is(next, "operator") && !view.hasAny(next, "operator", "*", "...") && (!view.has(next, "operator", "<") || callableKeywords.includes(text));
  };
  const [classLike, memberKinds, interfaceKind, classOrObject] = [["class", "interface", "object"], ["object", "interface", "type_literal"], ["interface"], ["class", "object"]].map(names => kindMask(frames, ...names));
  const member = (i: number) => atStartIn(frames, i, memberKinds) && colon(view, i + 1) >= 0;
  const [keywordId, booleanId, operatorId] = ["keyword", "boolean", "operator"].map(name => types.indexOf(name));
  for (let i = 0; i < view.count; i++) {
    const kind = tokens[3 * i];
    if (kind === keywordId) {
      const text = view.text(i), star = view.next(i + 1);
      if (atStartIn(frames, i, classLike) && balancedEnd(view, star) >= 0) hits.push([i, text === "new" && atStartIn(frames, i, interfaceKind) ? "keyword" : "function"]);
      else if (member(i)) hits.push([i, "identifier"]);
      else if (["function", "yield", "static", "async"].includes(text) && view.has(star, "operator", "*")) hits.push([star, "keyword"]);
      else if (softKeywords.includes(text) && usedAsName(i, text, star)) hits.push([i, source[tokens[3 * star + 1]] === "(" ? "function" : "identifier"]);
    } else if (kind === booleanId && member(i)) hits.push([i, "identifier"]);
    else if (kind === operatorId && view.has(i, "operator", "*") && atStartIn(frames, i, classOrObject)) hits.push([i, "keyword"]);
  }
  if (!hits.length) return result;
  const copy = new Uint32Array(tokens);
  for (const [at, name] of hits) copy[3 * at] = types.indexOf(name);
  return { tokens: copy, token_types: types, frames };
};

const statementKeywords = ["for", "while", "do", "if", "switch", "try", "with"];
const softKeywords = ["type", "from", "of", "as", "get", "set", "async", "static", "readonly", "declare", "abstract", "accessor", "override", "module", "namespace"];
const callableKeywords = ["type", "get", "set", "from", "module", "namespace"];
const fieldModifiers = ["readonly", "public", "private", "protected", "static", "abstract", "declare", "override", "accessor"];

export const propertyScope = claim((source, tokens, types, out, frames) => {
  const f = frames as Frames | undefined;
  const fn = typeId(types, "function"), property = typeId(types, "property");
  if (!f) return;
  const view = new View(source, tokens, types);
  const memberKinds = kindMask(f, "object", "interface", "type_literal"), objectKind = kindMask(f, "object"), classKind = kindMask(f, "class");
  const fieldEnd = (at: number) => {
    const next = view.next(at + 1);
    if (next < 0 || f.asi[next] === 1) return true;
    if (view.is(next, "punctuation")) return ":;}".includes(source[tokens[3 * next + 1]]);
    return view.hasAny(next, "operator", "=", "?", "?:", "!", "!:");
  };
  const decorated = (at: number) => {
    let before = view.prev(at - 1);
    while (view.hasAny(before, "keyword", ...fieldModifiers)) before = view.prev(before - 1);
    if (view.is(before, "decorator")) return true;
    if (!view.is(before, "punctuation") || source[tokens[3 * before + 2] - 1] !== ")") return false;
    let depth = 0;
    for (let token = before; token >= 0 && token > before - 200; token--) {
      if (!view.is(token, "punctuation")) continue;
      for (let char = tokens[3 * token + 2] - 1; char >= tokens[3 * token + 1]; char--) {
        const code = source.charCodeAt(char);
        if (code === 41) depth++;
        else if (code === 40 && !--depth) return char === tokens[3 * token + 1] && view.is(view.prev(token - 1), "decorator");
      }
    }
    return false;
  };
  for (const i of view.of("identifier")) {
    if (inFrame(f, i, classKind)) {
      if ((f.at_start[i] === 1 || decorated(i)) && fieldEnd(i) && !view.starts(view.prev(i - 1), "punctuation", ",")) out.emit(i, property, 20);
      continue;
    }
    if (!atStartIn(f, i, memberKinds)) continue;
    const after = colon(view, i + 1);
    if (after < 0) continue;
    if (atStartIn(f, i, objectKind) && functionValue(view, after)) out.emit(i, fn, 30);
    else if (!view.hasAny(view.next(after), "keyword", ...statementKeywords)) out.emit(i, property, 20);
  }
});

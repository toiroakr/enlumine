import { balancedEnd, functionValue } from "./bindings.js";
import { claim, typeId, View } from "./claims.js";
import type { Pass } from "./passes.js";

export interface Frames {
  frames: { bracket: number; kind: number; enter_idx: number; parent: number }[];
  active_frame: ArrayLike<number>;
  at_start: ArrayLike<number>;
  kind_names: string[];
}

function colon(view: View, at: number) {
  let first = view.next(at);
  if (view.is(first, "operator", "?")) first = view.next(first + 1);
  return view.is(first, "punctuation", ":") ? first + 1 : -1;
}

export const inFrame = (frames: Frames, i: number, ...kinds: string[]) =>
  kinds.some(name => frames.kind_names.indexOf(name) === frames.frames[frames.active_frame[i]].kind);

export const atStartIn = (frames: Frames, i: number, ...kinds: string[]) => frames.at_start[i] === 1 && inFrame(frames, i, ...kinds);

export const reservedNames: Pass = (source, result) => {
  const frames = result.frames as Frames | undefined;
  if (!frames) return result;
  const { tokens, token_types: types } = result;
  const view = new View(source, tokens, types);
  const hits: [number, string][] = [];
  for (let i = 0; i < view.count; i++) {
    const kind = view.type(i), at = (...kinds: string[]) => atStartIn(frames, i, ...kinds);
    const member = () => at("object", "interface", "type_literal") && colon(view, i + 1) >= 0;
    if (kind === "keyword") {
      const text = view.text(i), star = view.next(i + 1);
      if (at("class", "interface", "object") && balancedEnd(view, star) >= 0) hits.push([i, text === "new" && at("interface") ? "keyword" : "function"]);
      else if (member()) hits.push([i, "identifier"]);
      else if (["function", "yield", "static", "async"].includes(text) && view.is(star, "operator", "*")) hits.push([star, "keyword"]);
    } else if (kind === "boolean" && member()) hits.push([i, "identifier"]);
    else if (view.is(i, "operator", "*") && at("class", "object")) hits.push([i, "keyword"]);
  }
  if (!hits.length) return result;
  const copy = new Uint32Array(tokens);
  for (const [at, name] of hits) copy[3 * at] = types.indexOf(name);
  return { tokens: copy, token_types: types, frames };
};

const statementKeywords = ["for", "while", "do", "if", "switch", "try", "with"];

export const propertyScope = claim((source, tokens, types, out, frames) => {
  const f = frames as Frames | undefined;
  const fn = typeId(types, "function"), property = typeId(types, "property");
  if (!f) return;
  const view = new View(source, tokens, types);
  for (let i = 0; i < view.count; i++) {
    if (!view.is(i, "identifier") || !atStartIn(f, i, "object", "interface", "type_literal")) continue;
    const after = colon(view, i + 1);
    if (after < 0) continue;
    if (atStartIn(f, i, "object") && functionValue(view, after)) out.emit(i, fn, 30);
    else if (!view.is(view.next(after), "keyword", ...statementKeywords)) out.emit(i, property, 20);
  }
});

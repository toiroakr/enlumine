import { claim, typeId, View } from "./claims.js";
import type { Frames } from "./rules.js";

const modifiers = ["get", "set", "async", "readonly", "public", "private", "protected", "static", "abstract", "override", "accessor", "declare"];

export const parameters = claim((source, tokens, types, out, framesInput) => {
  const frames = framesInput as (Frames & { signals: ArrayLike<number> }) | undefined;
  const parameter = typeId(types, "parameter");
  const identifier = types.indexOf("identifier"), punctuation = types.indexOf("punctuation");
  const operator = types.indexOf("operator"), keyword = types.indexOf("keyword"), fn = types.indexOf("function");
  if (identifier < 0 || punctuation < 0) return;
  const view = new View(source, tokens, types), count = view.count, found: number[] = [];
  const isOperator = (i: number, text: string) => tokens[3 * i] === operator && view.text(i) === text;
  const prefix = (i: number) => tokens[3 * i] === operator ? view.text(i) === "..." : tokens[3 * i] === keyword && modifiers.includes(view.text(i));
  const followedByName = (from: number) => {
    for (let i = view.next(from); i >= 0; i = view.next(i + 1)) if (tokens[3 * i] === identifier || !prefix(i)) return tokens[3 * i] === identifier;
    return false;
  };
  const walk = (at: number, offset: number, depth: number, visit: (t: number, c: number, depth: number) => unknown): [number, number] | null => {
    for (let t = at; t < count; t++) {
      if (view.trivia(t)) continue;
      if (tokens[3 * t] !== punctuation) { if (visit(t, -1, depth)) return [t, -1]; continue; }
      for (let q = tokens[3 * t + 1] + (t === at ? offset + 1 : 0); q < tokens[3 * t + 2]; q++) {
        const c = source.charCodeAt(q);
        depth += c === 40 || c === 91 || c === 123 ? 1 : c === 41 || c === 93 || c === 125 ? -1 : 0;
        if (visit(t, c, depth)) return [t, q];
      }
    }
    return null;
  };
  const collect = (at: number, offset: number) => {
    let atStart = true, afterDefault = false;
    walk(at, offset, 1, (t, c, depth) => {
      if (c >= 0) {
        if (!depth) return true;
        if (c === 44 && depth === 1) atStart = true, afterDefault = false;
      } else if (depth === 1 && atStart && !afterDefault) {
        if (tokens[3 * t] === identifier) found.push(t), atStart = false;
        else if (isOperator(t, "=")) atStart = false, afterDefault = true;
        else if (!prefix(t) || !followedByName(t + 1)) atStart = false;
      }
    });
  };
  const arrowParen = (anchor: number, offset: number) => {
    const close = walk(anchor, offset, 1, (_, __, depth) => !depth);
    if (!close || close[1] + 1 < tokens[3 * close[0] + 2]) return false;
    const next = view.next(close[0] + 1);
    if (next < 0) return false;
    if (tokens[3 * next] === punctuation && tokens[3 * next + 2] - tokens[3 * next + 1] === 1 && source.charCodeAt(tokens[3 * next + 1]) === 58) {
      let arrow = false;
      walk(next, 0, 0, (t, c, depth) => c < 0 ? depth === 0 && isOperator(t, "=>") && (arrow = true) : depth < 0 || depth === 0 && (c === 44 || c === 59));
      return arrow;
    }
    return isOperator(next, "=>");
  };
  const paramsFrom = (from: number) => {
    let at = view.next(from);
    if (at >= 0 && isOperator(at, "<")) {
      let depth = 1;
      for (at++; at < count && depth; at++) if (tokens[3 * at] === operator) depth = Math.max(0, depth + (view.text(at) === "<" ? 1 : /^>(.?>)?$/.test(view.text(at)) ? -view.text(at).length : 0));
      at = view.next(at);
    }
    if (at < 0 || tokens[3 * at] !== punctuation || source.charCodeAt(tokens[3 * at + 1]) !== 40) return false;
    found.length = 0;
    collect(at, 0);
    return true;
  };
  const member = (i: number) => !!frames && frames.at_start[i] === 1 && ["class", "object", "interface"].includes(frames.kind_names[frames.frames[frames.active_frame[i]].kind]);
  for (let w = 0; w < count; w++) {
    const kind = tokens[3 * w];
    if (view.trivia(w)) continue;
    let matched = false;
    if (kind === keyword) {
      if (view.text(w) === "function") {
        let at = view.next(w + 1);
        if (isOperator(at, "*")) at = view.next(at + 1);
        if (at >= 0 && (tokens[3 * at] === identifier || tokens[3 * at] === fn)) at = view.next(at + 1);
        matched = paramsFrom(at);
      } else if (modifiers.includes(view.text(w)) && member(w)) matched = paramsFrom(w + 1);
    } else if (kind === identifier || kind === fn) {
      if (member(w)) matched = paramsFrom(w + 1);
      if (!matched && isOperator(view.next(w + 1), "=>")) { out.emit(w, parameter, 15); continue; }
    } else if (kind === punctuation && frames) {
      for (let s = 0, start = tokens[3 * w + 1]; start + s < tokens[3 * w + 2]; s++) {
        if (source.charCodeAt(start + s) !== 40) continue;
        if (s === 0) {
          const prev = view.prev(w - 1);
          if (tokens[3 * prev] === punctuation && source.charCodeAt(tokens[3 * prev + 2] - 1) === 58) {
            const ternary = !!(1 & frames.signals[prev]) && !isOperator(view.prev(prev - 1), "?");
            const frame = frames.frames[w > 0 ? frames.active_frame[w - 1] : 0];
            if (!(frame.bracket === 1 && frame.kind === frames.kind_names.indexOf("object")) && !ternary) continue;
          }
        }
        if (arrowParen(w, s)) {
          found.length = 0;
          collect(w, s);
          matched = true;
          break;
        }
      }
    }
    if (matched) for (const i of found) out.emit(i, parameter, 15);
  }
});

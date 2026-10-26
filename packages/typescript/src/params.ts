import { claim, typeId, View } from "./claims.js";
import { fieldModifiers, kindMask, softKeywords } from "./rules.js";
import type { Frames } from "./rules.js";

const modifiers = [...fieldModifiers, "get", "set", "async"];

export const parameters = claim((source, tokens, types, out, framesInput) => {
  const frames = framesInput as (Frames & { signals: ArrayLike<number> }) | undefined;
  const parameter = typeId(types, "parameter");
  const identifier = types.indexOf("identifier"), punctuation = types.indexOf("punctuation");
  const operator = types.indexOf("operator"), keyword = types.indexOf("keyword"), fn = types.indexOf("function"), template = types.indexOf("template");
  if (identifier < 0 || punctuation < 0) return;
  const view = new View(source, tokens, types), count = view.count, found: number[] = [];
  const isOperator = (i: number, text: string) => tokens[3 * i] === operator && view.text(i) === text;
  const prefix = (i: number) => tokens[3 * i] === operator ? view.text(i) === "..." : tokens[3 * i] === keyword && modifiers.includes(view.text(i));
  const nameEnds = (next: number) => next >= 0 && (view.is(next, "punctuation") ? ":,)".includes(source[tokens[3 * next + 1]]) : view.hasAny(next, "operator", "=", "?", "?:"));
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
  const computedKey = (before: number, after: number) => {
    if (!view.is(before, "punctuation") || source[tokens[3 * before + 2] - 1] !== "[" || !view.is(after, "punctuation") || source[tokens[3 * after + 1]] !== "]") return false;
    const length = tokens[3 * before + 2] - tokens[3 * before + 1], opener = length > 1 ? source[tokens[3 * before + 2] - 2] : source[tokens[3 * view.prev(before - 1) + 2] - 1];
    return (opener === "{" || opener === ",") && (source[tokens[3 * after + 1] + 1] === ":" || tokens[3 * after + 2] - tokens[3 * after + 1] === 1 && view.starts(view.next(after + 1), "punctuation", ":"));
  };
  const binds = (t: number, braced: boolean) => {
    const before = view.prev(t - 1), after = view.next(t + 1);
    if (braced && computedKey(before, after)) return false;
    return (view.is(before, "punctuation") && "{[,:".includes(source[tokens[3 * before + 2] - 1]) || view.has(before, "operator", "..."))
      && (view.is(after, "punctuation") && ",}]".includes(source[tokens[3 * after + 1]]) || view.has(after, "operator", "="));
  };
  const collect = (at: number, offset: number, strict: boolean) => {
    let atStart = true, afterDefault = false, pattern = false, braced = false, skip = 0;
    walk(at, offset, 1, (t, c, depth) => {
      if (c >= 0) {
        if (!depth) return true;
        if (skip && (depth < skip || c === 44 && depth === skip)) skip = 0;
        if (c === 44 && depth === 1) atStart = true, afterDefault = false;
        else if (depth === 2 && atStart && !afterDefault && (c === 123 || c === 91)) pattern = true, braced = c === 123, atStart = false;
        else if (depth === 1) pattern = false;
      } else if (depth > 1 && pattern) {
        if (isOperator(t, "=") && !skip) skip = depth;
        else if (!skip && tokens[3 * t] === identifier && binds(t, braced && depth === 3)) found.push(t);
      } else if (depth === 1 && atStart && !afterDefault) {
        if (tokens[3 * t] === identifier) strict && (tokens[3 * view.next(t + 1)] === template || view.has(view.next(t + 1), "operator", "<")) || found.push(t), atStart = false;
        else if (isOperator(t, "=")) atStart = false, afterDefault = true;
        else if (tokens[3 * t] === keyword && softKeywords.includes(view.text(t)) && nameEnds(view.next(t + 1))) found.push(t), atStart = false;
        else if (!prefix(t) || !followedByName(t + 1)) atStart = false;
      }
    });
  };
  let closeKey = -1, closeAt: [number, number] | null = null;
  const arrowParen = (anchor: number, offset: number, extended: boolean) => {
    if (closeKey !== anchor * 4096 + offset) closeAt = walk(anchor, offset, 1, (_, __, depth) => !depth), closeKey = anchor * 4096 + offset;
    const close = closeAt;
    if (!close) return false;
    const before = view.prev(anchor - 1), end = tokens[3 * close[0] + 2];
    const previous = offset > 0 ? source.charCodeAt(tokens[3 * anchor + 1] + offset - 1) : before >= 0 && tokens[3 * before] === punctuation ? source.charCodeAt(tokens[3 * before + 2] - 1) : -1;
    const merged = extended && close[1] + 2 === end && source.charCodeAt(close[1] + 1) === 58 && previous !== 41 && previous !== 93 && (offset > 0 || before < 0 || tokens[3 * before] === punctuation || tokens[3 * before] === keyword || tokens[3 * before] === operator && !isOperator(before, "?"));
    if (close[1] + 1 < end && !merged) return false;
    const next = merged ? close[0] : view.next(close[0] + 1);
    if (next < 0) return false;
    if (merged || tokens[3 * next] === punctuation && tokens[3 * next + 2] - tokens[3 * next + 1] === 1 && source.charCodeAt(tokens[3 * next + 1]) === 58) {
      let arrow = false, angle = 0;
      walk(next, merged ? close[1] + 1 - tokens[3 * next + 1] : 0, 0, (t, c, depth) => {
        if (c >= 0) return depth < 0 || depth === 0 && (c === 44 && !angle || c === 59);
        if (tokens[3 * t] === operator) {
          const text = view.text(t);
          if (text === "<") angle++;
          else if (/^>+$/.test(text)) angle = Math.max(0, angle - text.length);
        }
        return depth === 0 && !angle && isOperator(t, "=>") && (arrow = true);
      });
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
    collect(at, 0, false);
    return true;
  };
  const memberKinds = frames ? kindMask(frames, "class", "object", "interface") : 0;
  const member = (i: number) => !!frames && frames.at_start[i] === 1 && (memberKinds >> frames.frames[frames.active_frame[i]].kind & 1) === 1;
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
      if (!matched && isOperator(view.next(w + 1), "=>") && !view.has(view.prev(w - 1), "keyword", "typeof")) { out.emit(w, parameter, 15); continue; }
    } else if (kind === punctuation && frames) {
      const start = tokens[3 * w + 1], length = tokens[3 * w + 2] - start;
      let paren = false;
      for (let s = 0; s < length && !paren; s++) paren = source.charCodeAt(start + s) === 40;
      let guarded = false;
      if (paren) {
        const prev = view.prev(w - 1);
        if (tokens[3 * prev] === punctuation && source.charCodeAt(tokens[3 * prev + 2] - 1) === 58) {
          const ternary = !!(1 & frames.signals[prev]) && !isOperator(view.prev(prev - 1), "?");
          const frame = frames.frames[w > 0 ? frames.active_frame[w - 1] : 0];
          guarded = !(frame.bracket === 1 && frame.kind === frames.kind_names.indexOf("object")) && !ternary;
        }
        for (let extended = 0; extended < 2 && !matched; extended++)
          for (let s = 0; s < length; s++) {
            if (source.charCodeAt(start + s) !== 40 || !extended && s === 0 && guarded || !arrowParen(w, s, !!extended)) continue;
            found.length = 0;
            collect(w, s, !!extended);
            matched = true;
            break;
          }
      }
    }
    if (matched) for (const i of found) out.emit(i, parameter, 15);
  }
});

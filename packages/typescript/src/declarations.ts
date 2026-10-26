import { claim, typeId, View } from "./claims.js";
import { fieldModifiers, inFrame, kindMask } from "./rules.js";
import type { Frames } from "./rules.js";

export const declarations = claim((source, tokens, types, out, framesInput) => {
  const frames = framesInput as Frames | undefined;
  const parameter = typeId(types, "parameter");
  let labelId = -1;
  const label = () => labelId < 0 ? labelId = typeId(types, "label") : labelId;
  const view = new View(source, tokens, types);
  const starts = (i: number, ch: string) => view.starts(i, "punctuation", ch);
  const sameLine = (a: number, b: number) => !/[\n\r\u2028\u2029]/.test(source.slice(tokens[3 * a + 2], tokens[3 * b + 1]));
  const blockKinds = frames ? ~kindMask(frames, "object", "class", "interface", "type_literal") : 0;
  const memberKinds = frames ? kindMask(frames, "object", "class", "interface", "type_literal") : 0;
  const memberStart = (bracket: number) => {
    let head = bracket;
    for (let at = view.prev(head - 1); view.hasAny(at, "keyword", ...fieldModifiers); at = view.prev(head - 1)) head = at;
    return frames!.at_start[head] === 1;
  };
  const blockBody = (i: number) => {
    const enter = frames!.frames[frames!.active_frame[i]].enter_idx;
    if (enter < 0) return inFrame(frames!, i, blockKinds);
    const text = view.text(enter), brace = text.lastIndexOf("{");
    if (brace > 0) return ")};{".includes(text[brace - 1]) && inFrame(frames!, i, blockKinds);
    const head = view.prev(enter - 1);
    if (head < 0) return inFrame(frames!, i, blockKinds);
    if (view.is(head, "punctuation")) return ")};{".includes(source[tokens[3 * head + 2] - 1]) && inFrame(frames!, i, blockKinds);
    if (view.is(head, "keyword")) return view.hasAny(head, "keyword", "else", "try", "finally", "do", "catch", "static");
    if (view.has(head, "operator", "=>")) return inFrame(frames!, i, blockKinds);
    const before = view.prev(head - 1);
    return view.is(head, "namespace") && before >= 0 && (view.has(before, "keyword", "namespace") || view.has(before, "keyword", "module"));
  };
  for (const i of view.of("identifier")) {
    const next = view.next(i + 1), before = view.prev(i - 1);
    if (view.hasAny(before, "keyword", "break", "continue")) {
      if (sameLine(before, i)) out.emit(i, label(), 50);
    } else if (starts(next, ":") && frames) {
      if (frames.at_start[i] === 1 && source[tokens[3 * i + 1] - 1] !== "#" && blockBody(i) && (before < 0 || view.is(before, "punctuation") && ";{}".includes(source[tokens[3 * before + 2] - 1]))) out.emit(i, label(), 50);
      else if (starts(before, "[") && view.text(before).endsWith("[") && memberStart(before) && (memberKinds >> frames.frames[frames.frames[frames.active_frame[i]].parent].kind & 1) === 1) out.emit(i, parameter, 50);
    }
  }
  for (const i of view.of("keyword")) {
    if (!view.has(i, "keyword", "catch") || view.has(view.prev(i - 1), "punctuation", ".")) continue;
    const open = view.next(i + 1), name = view.next(open + 1), after = view.next(name + 1);
    if (view.has(open, "punctuation", "(") && view.is(name, "identifier") && (starts(after, ")") || starts(after, ":"))) out.emit(name, parameter, 50);
  }
});

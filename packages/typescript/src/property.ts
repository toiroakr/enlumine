import { claim, typeId, View } from "./claims.js";
import { propertyScope } from "./rules.js";
import type { Frames } from "./rules.js";

const BRACE = 1, BRACKET = 2;

export const properties = claim((source, tokens, types, out, framesInput) => {
  propertyScope.__claim(source, tokens, types, out, framesInput);
  const frames = framesInput as Frames | undefined;
  if (!frames) return;
  const view = new View(source, tokens, types);
  const property = typeId(types, "property");
  const colonAfter = (i: number) => {
    const at = view.next(i + 1);
    return view.has(at, "punctuation", ":") || view.starts(view.has(at, "operator", "?") ? view.next(at + 1) : -1, "punctuation", ":");
  };
  const computedKey = (frame: number, i: number) => {
    const current = frames.frames[frame];
    if (current.parent < 0 || frames.frames[current.parent].bracket !== BRACE) return false;
    const open = current.enter_idx;
    if (view.text(open)[0] === "[" && view.has(view.prev(open - 1), "operator", "?")) return false;
    let depth = 1;
    for (let t = i + 1; t < view.count; t++) {
      if (!view.is(t, "punctuation")) continue;
      const text = view.text(t);
      for (let r = 0; r < text.length; r++) {
        if (text[r] === "[") depth++;
        else if (text[r] === "]" && !--depth) return r + 1 < text.length ? text[r + 1] === ":" : view.starts(view.next(t + 1), "punctuation", ":");
      }
    }
    return false;
  };
  for (const p of view.of("identifier")) {
    const frame = frames.active_frame[p];
    if (frames.frames[frame].bracket !== BRACKET || !colonAfter(p)) continue;
    const previous = view.prev(p - 1), text = view.text(previous);
    if (view.is(previous, "punctuation")) {
      if (text.endsWith("[")) {
        if (computedKey(frame, p)) continue;
      } else if (!text.endsWith(",") && !text.endsWith("...")) continue;
    } else if (!view.hasAny(previous, "operator", "...")) continue;
    out.emit(p, property, 20);
  }
});

import { claim, typeId, View } from "./claims.js";

export function balancedEnd(view: View, from: number) {
  if (!view.starts(from, "punctuation", "(")) return -1;
  let depth = 0;
  for (let i = from; i < Math.min(view.count, from + 201); i++)
    if (view.is(i, "punctuation"))
      for (const c of view.text(i)) if (c === "(") depth++; else if (c === ")" && !--depth) return i + 1;
  return -1;
}

const valueStart = (view: View, at: number) =>
  view.has(at, "keyword", "function") || view.is(at, "identifier") && view.has(view.next(at + 1), "operator", "=>") || view.has(view.next(balancedEnd(view, at)), "operator", "=>");

export const functionValue = (view: View, at: number) => {
  const start = view.next(at);
  return valueStart(view, start) || view.has(start, "keyword", "async") && valueStart(view, view.next(start + 1));
};

export const functionBindings = claim((source, tokens, types, out) => {
  const fn = typeId(types, "function"), view = new View(source, tokens, types);
  for (const i of view.of("identifier")) {
    const equals = view.next(i + 1);
    if (view.has(equals, "operator", "=") && functionValue(view, equals + 1) && !view.hasAny(view.prev(i - 1), "keyword", "type", "typeof")) out.emit(i, fn, 30);
  }
});

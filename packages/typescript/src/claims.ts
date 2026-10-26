export type Claims = { emit(index: number, type: number, precedence: number): void };
export type Claim = ((source: string, tokens: Uint32Array, types: string[], out: Claims, frames?: unknown) => void);
export type ClaimProducer = Claim & { __claim: Claim };

export function claim(run: Claim): ClaimProducer {
  return Object.assign((() => { throw new Error("claim producers run in batches"); }) as unknown as ClaimProducer, { __claim: run });
}

export function typeId(types: string[], name: string): number {
  let id = types.indexOf(name);
  if (id < 0) {
    id = types.length;
    types.push(name);
  }
  return id;
}

export class View {
  declare readonly count: number;
  declare private comment: number;
  constructor(readonly source: string, readonly tokens: Uint32Array, readonly types: string[]) {
    this.count = tokens.length / 3;
    this.comment = types.indexOf("comment");
  }
  kind(i: number) { return this.tokens[3 * i]; }
  text(i: number) { return this.source.slice(this.tokens[3 * i + 1], this.tokens[3 * i + 2]); }
  type(i: number) { return this.types[this.tokens[3 * i]]; }
  is(i: number, type: string, ...texts: string[]) { return this.type(i) === type && (!texts.length || texts.includes(this.text(i))); }
  starts(i: number, type: string, ch: string) { return this.is(i, type) && this.text(i)[0] === ch; }
  trivia(i: number) { return this.tokens[3 * i] === this.comment; }
  next(i: number) {
    for (; i < this.count; i++) if (!this.trivia(i)) return i;
    return -1;
  }
  prev(i: number) {
    for (; i >= 0; i--) if (!this.trivia(i)) return i;
    return -1;
  }
}

export function angleRun(text: string) { return /^>{1,3}$/.test(text) ? text.length : 0; }

export const follows = (view: View, i: number, operators: RegExp) =>
  i < 0 || (view.is(i, "punctuation") ? /^[(){}[\],;.:]/.test(view.text(i)) : view.is(i, "operator") ? operators.test(view.text(i)) : view.is(i, "keyword", "extends", "implements"));

export function closingAngle(view: View, from: number, collect?: number[]) {
  let angles = 1, braces = 0;
  for (let i = from + 1; i < view.count; i++) {
    if (view.is(i, "operator")) {
      const text = view.text(i);
      if (text === "<" || !braces && angleRun(text)) {
        collect?.push(i);
        angles += text === "<" ? 1 : -text.length;
        if (angles <= 0) return i;
      }
    } else if (view.is(i, "punctuation"))
      for (const c of view.text(i)) {
        if (c === "{") braces++;
        else if (c === "}" && !braces--) return -1;
        else if (c === ";" && !braces) return -1;
      }
  }
  return -1;
}

export const constants = claim((source, tokens, types, out) => {
  const constant = typeId(types, "constant"), view = new View(source, tokens, types);
  for (let i = 0; i < view.count; i++) if (view.is(i, "identifier") && /^[A-Z][A-Z\d_]+$/.test(view.text(i))) out.emit(i, constant, 55);
});

function starAfterImport(view: View, at: number) {
  let i = view.next(at + 1);
  if (i < 0) return -1;
  const after = view.next(i + 1);
  if (view.is(after, "punctuation", ",")) i = view.next(after + 1);
  else if (view.text(i) === "type") i = after;
  return view.is(i, "operator", "*") ? i : -1;
}

export const namespaces = claim((source, tokens, types, out) => {
  const namespace = typeId(types, "namespace"), view = new View(source, tokens, types);
  const name = (i: number) => view.is(i, "identifier") && out.emit(i, namespace, 46);
  for (let i = 0; i < view.count; i++) {
    if (!view.is(i, "keyword")) continue;
    const text = view.text(i);
    if (text === "import" || text === "export") {
      const star = starAfterImport(view, i), as = star < 0 ? -1 : view.next(star + 1);
      if (view.is(as, "keyword", "as")) name(view.next(as + 1));
    } else if (text === "namespace" || text === "module") name(view.next(i + 1));
  }
});

export const constBindings = claim((source, tokens, types, out) => {
  const constant = typeId(types, "constant"), view = new View(source, tokens, types);
  const count = view.count;
  for (let i = 0; i < count; i++) {
    if (!view.is(i, "keyword")) continue;
    const text = view.text(i);
    if (text === "import" || text === "export") {
      const star = starAfterImport(view, i);
      if (star >= 0) out.emit(star, constant, 55);
      continue;
    }
    if (text !== "const") continue;
    let depth = 0, angle = 0, pattern = true, value = false, valueDepth = 0;
    const objects: boolean[] = [];
    for (let j = view.next(i + 1); j >= 0 && j < count; j++) {
      if (view.trivia(j)) continue;
      const kind = view.type(j), word = view.text(j);
      if (kind === "punctuation") {
        for (const c of word) {
          if (c === "{") { depth++; objects.push(true); pattern = true; }
          else if (c === "[") { depth++; objects.push(false); pattern = true; }
          else if (c === "(") { depth++; objects.push(false); pattern = false; }
          else if (c === "}" || c === "]" || c === ")") {
            if (depth === 0) { j = count; break; }
            depth--; objects.pop();
            if (value && depth < valueDepth) value = false;
            pattern = false;
          } else if (c === ",") {
            if (value && depth === valueDepth && angle === 0) value = false;
            if (!value) pattern = true;
          } else if (c === ";") {
            if (depth === 0) { j = count; break; }
          } else if (c === ":") {
            if (depth > 0 && objects[objects.length - 1]) pattern = true;
            else if (!value) { value = true; valueDepth = depth; }
          } else pattern = false;
        }
        continue;
      }
      if (kind === "operator") {
        if (word === "<") angle++;
        else if (word === ">") angle && angle--;
        else if (word === ">>" || word === ">>>") angle = Math.max(0, angle - word.length);
        else if (word === "=" && !value) { value = true; valueDepth = depth; }
        else if (word === "..." && !value) { pattern = true; continue; }
        pattern = false;
        continue;
      }
      if (kind === "keyword") {
        if ((word === "of" || word === "in") && depth === 0) break;
        pattern = false;
        continue;
      }
      if (kind === "identifier" && !value && pattern && !(depth > 0 && objects[objects.length - 1] && view.is(view.next(j + 1), "punctuation", ":"))) out.emit(j, constant, 25);
      pattern = false;
    }
  }
});

export const classNames = claim((source, tokens, types, out) => {
  const view = new View(source, tokens, types);
  const count = view.count;
  if (!count) return;
  const className = typeId(types, "class_name");
  const nameLike = (i: number) => ["identifier", "type", "function"].includes(view.type(i));
  const skipAngles = (i: number) => {
    if (!view.is(i, "operator", "<")) return i;
    let depth = 1, j = i + 1;
    for (; j < count && depth > 0; j++) {
      if (view.is(j, "operator", "<")) depth++;
      else if (view.is(j, "operator", ">")) depth--;
    }
    return j;
  };
  const dotted = (from: number) => {
    let i = view.next(from), last = -1;
    while (nameLike(i)) {
      last = i;
      i = view.next(i + 1);
      if (!view.is(i, "punctuation", ".")) break;
      i = view.next(i + 1);
    }
    if (last >= 0) out.emit(last, className, 50);
    return i < 0 ? count : i;
  };
  const heritage = (from: number) => {
    let i = view.next(from);
    while (nameLike(i)) {
      i = view.next(dotted(i));
      if (view.is(i, "operator", "<")) i = view.next(skipAngles(i));
      if (!view.is(i, "punctuation", ",")) break;
      i = view.next(i + 1);
    }
    return i < 0 ? count : i;
  };
  for (let i = 0; i < count; i++) {
    if (!view.is(i, "keyword")) continue;
    const text = view.text(i);
    if (text === "class" || text === "interface") {
      let j = view.next(i + 1);
      if (nameLike(j)) {
        out.emit(j, className, 50);
        j = view.next(j + 1);
      }
      if (view.is(j, "operator", "<")) j = view.next(skipAngles(j));
      for (let n = 0; n < 2; n++) {
        j = view.next(j);
        if (!view.is(j, "keyword", "extends", "implements")) break;
        j = heritage(j + 1);
      }
    } else if (text === "new" || text === "instanceof") dotted(i + 1);
  }
});

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

const lists = new WeakMap<Uint32Array, Map<number, number[]>>();

export const forgetLists = (tokens: Uint32Array) => { lists.delete(tokens); };

export class View {
  declare readonly count: number;
  declare private comment: number;
  constructor(readonly source: string, readonly tokens: Uint32Array, readonly types: string[]) {
    this.count = tokens.length / 3;
    this.comment = types.indexOf("comment");
  }
  text(i: number) { return this.source.slice(this.tokens[3 * i + 1], this.tokens[3 * i + 2]); }
  type(i: number) { return this.types[this.tokens[3 * i]]; }
  is(i: number, type: string) { return this.types[this.tokens[3 * i]] === type; }
  has(i: number, type: string, text: string) {
    const from = this.tokens[3 * i + 1];
    return this.is(i, type) && this.tokens[3 * i + 2] - from === text.length && this.source.startsWith(text, from);
  }
  hasAny(i: number, type: string, ...texts: string[]) {
    if (!this.is(i, type)) return false;
    const from = this.tokens[3 * i + 1], length = this.tokens[3 * i + 2] - from;
    return texts.some(text => text.length === length && this.source.startsWith(text, from));
  }
  starts(i: number, type: string, ch: string) { return this.is(i, type) && this.source[this.tokens[3 * i + 1]] === ch; }
  of(type: string) {
    const id = this.types.indexOf(type);
    let byType = lists.get(this.tokens), found = byType?.get(id);
    if (found) return found;
    found = [];
    for (let i = 0; i < this.count; i++) if (this.tokens[3 * i] === id) found.push(i);
    if (!byType) lists.set(this.tokens, byType = new Map());
    byType.set(id, found);
    return found;
  }
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
  i < 0 || (view.is(i, "punctuation") ? /^[(){}[\],;.:]/.test(view.text(i)) : view.is(i, "operator") ? operators.test(view.text(i)) : view.hasAny(i, "keyword", "extends", "implements"));

export function closingAngle(view: View, from: number, collect?: number[]) {
  let angles = 1, braces = 0;
  const { tokens, types } = view, operator = types.indexOf("operator"), punctuation = types.indexOf("punctuation");
  for (let i = from + 1; i < view.count; i++) {
    const kind = tokens[3 * i];
    if (kind === operator) {
      const text = view.text(i);
      if (text === "<" || !braces && angleRun(text)) {
        collect?.push(i);
        angles += text === "<" ? 1 : -text.length;
        if (angles <= 0) return i;
      }
    } else if (kind === punctuation)
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
  for (const i of view.of("identifier")) if (/^[A-Z][A-Z\d_]+$/.test(view.text(i))) out.emit(i, constant, 55);
});

function starAfterImport(view: View, at: number) {
  let i = view.next(at + 1);
  if (i < 0) return -1;
  const after = view.next(i + 1);
  if (view.has(after, "punctuation", ",")) i = view.next(after + 1);
  else if (view.text(i) === "type") i = after;
  return view.has(i, "operator", "*") ? i : -1;
}

export const namespaces = claim((source, tokens, types, out) => {
  const namespace = typeId(types, "namespace"), view = new View(source, tokens, types);
  const name = (i: number) => view.is(i, "identifier") && out.emit(i, namespace, 46);
  for (const i of view.of("keyword")) {
    const text = view.text(i);
    if (text === "import" || text === "export") {
      const star = starAfterImport(view, i), as = star < 0 ? -1 : view.next(star + 1);
      if (view.has(as, "keyword", "as")) name(view.next(as + 1));
    } else if (text === "namespace" || text === "module") name(view.next(i + 1));
  }
});

export const constBindings = claim((source, tokens, types, out) => {
  const constant = typeId(types, "constant"), view = new View(source, tokens, types);
  const count = view.count;
  for (const i of view.of("keyword")) {
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
      if (kind === "identifier" && !value && pattern && !(depth > 0 && objects[objects.length - 1] && view.has(view.next(j + 1), "punctuation", ":"))) out.emit(j, constant, 25);
      pattern = false;
    }
  }
});

export const enums = claim((source, tokens, types, out) => {
  const view = new View(source, tokens, types);
  for (const i of view.of("keyword")) {
    if (!view.has(i, "keyword", "enum")) continue;
    const name = view.next(i + 1), open = view.next(name + 1);
    if (!view.is(name, "identifier") || !view.starts(open, "punctuation", "{")) continue;
    const className = typeId(types, "class_name"), constant = typeId(types, "constant");
    out.emit(name, className, 50);
    let depth = 0, member = false;
    for (let t = open; t < view.count; t++) {
      if (view.trivia(t)) continue;
      if (!view.is(t, "punctuation")) {
        if (member && depth === 1 && view.is(t, "identifier")) out.emit(t, constant, 50);
        member = false;
        continue;
      }
      for (const c of view.text(t)) {
        if ("{([".includes(c)) { depth++; member = depth === 1; }
        else if ("})]".includes(c)) depth--;
        else if (c === "," && depth === 1) member = true;
      }
      if (depth <= 0) break;
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
    if (!view.has(i, "operator", "<")) return i;
    let depth = 1, j = i + 1;
    for (; j < count && depth > 0; j++) {
      if (view.has(j, "operator", "<")) depth++;
      else if (view.has(j, "operator", ">")) depth--;
    }
    return j;
  };
  const dotted = (from: number) => {
    let i = view.next(from), last = -1;
    while (nameLike(i)) {
      last = i;
      i = view.next(i + 1);
      if (!view.has(i, "punctuation", ".")) break;
      i = view.next(i + 1);
    }
    if (last >= 0) out.emit(last, className, 50);
    return i < 0 ? count : i;
  };
  const heritage = (from: number) => {
    let i = view.next(from);
    while (nameLike(i)) {
      i = view.next(dotted(i));
      if (view.has(i, "operator", "<")) i = view.next(skipAngles(i));
      if (!view.has(i, "punctuation", ",")) break;
      i = view.next(i + 1);
    }
    return i < 0 ? count : i;
  };
  for (const i of view.of("keyword")) {
    const text = view.text(i);
    if (text === "class" || text === "interface") {
      let j = view.next(i + 1);
      if (nameLike(j)) {
        out.emit(j, className, 50);
        j = view.next(j + 1);
      }
      if (view.has(j, "operator", "<")) j = view.next(skipAngles(j));
      for (let n = 0; n < 2; n++) {
        j = view.next(j);
        if (!view.hasAny(j, "keyword", "extends", "implements")) break;
        j = heritage(j + 1);
      }
    } else if (text === "new" || text === "instanceof") dotted(i + 1);
  }
});

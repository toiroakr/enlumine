import { balancedEnd } from "./bindings.js";
import { angleRun, claim, closingAngle, follows, typeId, View } from "./claims.js";
import { inFrame } from "./rules.js";
import type { Frames } from "./rules.js";

type FrameData = Frames & { signals: ArrayLike<number>; flag_names: string[] };

const valueOperators = new Set("+,-,*,/,%,**,==,!=,===,!==,<=,>=,&&,||,??,?.,+=,-=,*=,/=,%=,&=,|=,^=,&&=,||=,??=,<<,>>,>>>,<<=,>>=,>>>=,**=,++,--".split(","));
const statementKeywords = new Set("return.if.else.for.while.do.switch.case.break.continue.throw.try.catch.finally.function.class.interface.enum.namespace.module.let.const.var.import.export.type".split("."));
const terminalKeywords = ["this", "void", "undefined", "null", "never", "unknown", "any", "object"];

const COMMA = 1, EQ = 2, QMARK = 4, ANGLE = 8, BRACE = 16, VERIFY = 32;
const plain = COMMA | EQ, strict = plain | BRACE, lenient = EQ | BRACE, asExpression = plain | QMARK, generic = ANGLE | VERIFY;

const FAIL = -2;

function genericArrow(view: View, at: number) {
  let depth = 1;
  for (let i = at + 1; i < view.count; i++) {
    if (view.is(i, "operator")) {
      const text = view.text(i), run = angleRun(text);
      if (text === "<") depth++;
      else if (run && (depth -= run) <= 0) return view.starts(view.next(i + 1), "punctuation", "(");
    } else if (view.is(i, "punctuation") && /[;}]/.test(view.text(i))) return false;
  }
  return false;
}

function closerAhead(view: View, at: number) {
  const prev = view.prev(at - 1);
  if (view.is(prev, "punctuation")) return /[\])}]$/.test(view.text(prev));
  return view.is(prev, "identifier") || view.is(prev, "operator") && angleRun(view.text(prev)) > 0 || view.is(prev, "keyword", ...terminalKeywords);
}

function spreadOrOpener(view: View, at: number) {
  const prev = view.prev(at - 1);
  return view.is(prev, "punctuation") ? /[[,]$|\.\.\.$/.test(view.text(prev)) : view.is(prev, "operator", "...");
}

function span(view: View, cfg: number, from: number, mark: number[]): number {
  const { tokens, count } = view;
  const close = cfg & VERIFY ? closingAngle(view, from - 1) : 0;
  if (close < 0 || cfg & VERIFY && !follows(view, view.next(close + 1), /^([=|&>?!]|=>)$/)) return FAIL;
  let paren = 0, brace = 0, bracket = 0, angle = 0;
  const flat = () => !(paren || brace || bracket || angle);
  for (let i = from; i < count; i++) {
    const type = view.type(i), text = view.text(i);
    if (type === "punctuation") {
      for (let q = 0; q < text.length; q++) {
        const ch = text[q];
        if (ch === "(") paren++;
        else if (ch === ")") { if (--paren < 0) return i; }
        else if (ch === "{") {
          if (cfg & BRACE && !brace && !paren && closerAhead(view, i)) return i;
          brace++;
        } else if (ch === "}") { if (--brace < 0) return i; }
        else if (ch === "[") bracket++;
        else if (ch === "]") { if (--bracket < 0) return i; }
        else if (ch === ";" && flat()) return i;
      }
      if (cfg & COMMA && flat() && text.includes(",")) return i;
    } else if (type === "operator") {
      if (text === "<") angle++;
      else {
        const run = angleRun(text);
        if (run) {
          if (angle >= run) { angle -= run; continue; }
          angle = 0;
          if (cfg & ANGLE) return i;
        }
        if (flat() && (text === "=" ? cfg & EQ : text === "?" ? cfg & QMARK : text === "=>" ? !view.text(view.prev(i - 1)).endsWith(")") : valueOperators.has(text))) return i;
      }
    } else if (type === "keyword") {
      if (flat() && statementKeywords.has(text)) return i;
    } else if (type === "identifier") {
      const inside = paren > 0 || brace > 0, next = inside || bracket > 0 && spreadOrOpener(view, i) ? view.next(i + 1) : -1;
      let key = false;
      if (next >= 0) {
        const nextText = view.text(next);
        key = view.is(next, "punctuation") ? nextText === ":" || inside && nextText[0] === "(" :
          view.is(next, "operator") && (nextText === "?" && view.starts(view.next(next + 1), "punctuation", ":") || inside && nextText === "<" && genericArrow(view, next));
      }
      if (!key) mark.push(i);
    }
  }
  return count;
}

const ends = (view: View, at: number, type: string, ...suffixes: string[]) => view.is(at, type) && suffixes.some(s => view.text(at).endsWith(s));

export const typeRewrites = claim((source, tokens, types, out, framesInput) => {
  const typeType = typeId(types, "type");
  const frames = framesInput as FrameData | undefined;
  if (!frames) return;
  const view = new View(source, tokens, types);
  const flagBit = (name: string) => { const at = frames.flag_names.indexOf(name); return at < 0 ? 1 << 30 : 1 << at + 1; };
  const varDecl = flagBit("var_decl"), ifaceHead = flagBit("iface_head"), aliasHead = flagBit("alias_head");
  const inKinds = (i: number, ...kinds: string[]) => inFrame(frames, i, ...kinds);
  const plainColon = (i: number) => frames.signals[i] >= 0 && !(frames.signals[i] & 1);
  const flags = (i: number, bit: number) => frames.signals[i] >= 0 && (frames.signals[i] & bit) === bit;
  const prevAt = (i: number) => view.prev(i - 1);
  const mark: number[] = [];
  const run = (cfg: number, from: number) => {
    mark.length = 0;
    return span(view, cfg, from, mark);
  };
  const emit = () => { for (const i of mark) out.emit(i, typeType, 45); };
  const apply = (cfg: number, from: number) => { if (run(cfg, from) !== FAIL) emit(); };
  const asImport = (w: number) => {
    const before = prevAt(w), t1 = prevAt(before), t0 = prevAt(t1);
    return (view.is(before, "identifier") || view.is(before, "keyword")) && (ends(view, t1, "punctuation", ",") || ends(view, t1, "punctuation", "{") && (ends(view, t0, "keyword", "import", "export", "type") || ends(view, t0, "punctuation", ",")));
  };
  const extendsAfterIdentifier = (w: number) => {
    const b1 = prevAt(w), b2 = prevAt(b1);
    return view.is(b1, "identifier") && (ends(view, b2, "operator", "<") || ends(view, b2, "punctuation", ","));
  };
  for (let w = 0; w < view.count; w++) {
    const type = view.type(w), text = view.text(w);
    if (type === "punctuation") {
      if (!text.endsWith(":") || !plainColon(w)) continue;
      if (text.endsWith("):") || text === ":" && ends(view, prevAt(w), "punctuation", ")")) apply(strict, w + 1);
      else if (inKinds(w, "paren", "class", "interface", "bracket") || inKinds(w, "top", "block") && flags(w, varDecl)) apply(plain, w + 1);
    } else if (type === "keyword") {
      if (text === "as" && inKinds(w, "object") && asImport(w)) out.emit(w, types.indexOf("keyword"), 70);
      else if (text === "as" || text === "satisfies") apply(asExpression, w + 1);
      else if (text === "implements" || text === "extends" && (flags(w, ifaceHead) || extendsAfterIdentifier(w))) apply(lenient, w + 1);
    } else if (type === "operator") {
      if (text === "<") {
        const b = prevAt(w);
        if (view.is(b, "identifier")) apply(generic, w + 1);
        else if (view.is(b, "operator") || view.is(b, "keyword") || ends(view, b, "punctuation", "(", ",", "[", "{", ":", ";")) {
          const end = run(generic, w + 1), close = view.next(end);
          if (end !== FAIL && view.is(close, "operator", ">") && balancedEnd(view, view.next(close + 1)) >= 0) emit();
        }
      } else if (text === "=" && flags(w, aliasHead) && inKinds(w, "top", "block")) {
        const b = prevAt(w);
        if (view.is(b, "identifier") || ends(view, b, "operator", ">")) apply(plain, w + 1);
      }
    }
  }
});

import { execute } from "@enlumine/core";
import type { Grammar, PackedTokens } from "@enlumine/core";
import * as grammars from "enlumine:typescript-grammar";
import { javascriptFrames } from "enlumine:typescript-frames";
import { trackFrames } from "./frames.js";
import { functionBindings } from "./bindings.js";
import { claim, classNames, constBindings, constants, namespaces, typeId, View } from "./claims.js";
import { embedHosts, splice, weave } from "./embed.js";
import type { Embedded, Language } from "./embed.js";
import { parameters } from "./params.js";
import { reclassify } from "./run.js";
import { propertyScope, reservedNames } from "./rules.js";

const cssFunctions = claim((source, tokens, types, out) => {
  const identifier = types.indexOf("identifier"), punctuation = types.indexOf("punctuation"), fn = typeId(types, "function");
  const view = new View(source, tokens, types);
  for (let i = 0; i < view.count; i++) {
    const next = tokens[3 * i] === identifier ? view.next(i + 1) : -1;
    if (next >= 0 && tokens[3 * next] === punctuation && view.text(next) === "(") out.emit(i, fn, 30);
  }
});

const run = (grammar: Grammar, stages: Parameters<typeof reclassify>[0]): Language => {
  const classify = reclassify(stages);
  return source => classify(source, execute(source, grammar));
};

export const css: Language = run(grammars.css as Grammar, [cssFunctions]);
const hosts = embedHosts({ raw_script: source => javascript(source), raw_style: css });
export const html: Language = source => hosts(source, execute(source, grammars.html as Grammar));
export const jsdoc: Language = source => execute(source, grammars.jsdoc as Grammar);

function taggedTemplate(source: string, tokens: Uint32Array, index: number, types: string[]): Embedded | null {
  const name = source.slice(tokens[3 * index + 1], tokens[3 * index + 2]), language = name === "html" ? html : name === "css" ? css : null;
  if (!language) return null;
  const template = types.indexOf("template"), punctuation = types.indexOf("punctuation"), first = index + 1, open = tokens[3 * first + 1];
  if (tokens[3 * first] !== template || source[open] !== "`") return null;
  const regions: Embedded["regions"] = [[open, open + 1, "template"]];
  let depth = 0, hole = 0;
  for (let at = first; at < tokens.length / 3; at++) {
    const kind = tokens[3 * at], from = tokens[3 * at + 1], to = tokens[3 * at + 2];
    if (depth) {
      if (kind === punctuation) {
        for (const c of source.slice(from, to)) c === "{" ? depth++ : c === "}" && depth--;
        if (!depth) regions.push([tokens[3 * hole + 1], to, hole, at + 1]);
      }
    } else if (kind === template) {
      const skip = +(at === first), closing = to - from > skip && source[to - 1] === "`";
      if ((closing ? to - 1 : to) > from + skip) regions.push([from + skip, closing ? to - 1 : to]);
      if (closing) {
        regions.push([to - 1, to, "template"]);
        return { from: first, to: at + 1, regions, language, html: language === html };
      }
    } else if (kind === punctuation && to - from === 2 && source.startsWith("${", from)) { depth = 1; hole = at; }
    else return null;
  }
  return null;
}

function documentation(source: string, tokens: Uint32Array, index: number): Embedded | null {
  const start = tokens[3 * index + 1], end = tokens[3 * index + 2];
  return end - start > 3 && source.startsWith("/**", start)
    ? { from: index, to: index + 1, language: jsdoc, regions: [[start, start + 3, "comment"], [start + 3, end]] }
    : null;
}

const once = (source: string, result: PackedTokens) => weave(result, typeOf => {
  const { tokens, token_types: types } = result, identifier = types.indexOf("identifier"), comment = types.indexOf("comment"), edits: [number, number, number[]][] = [];
  for (let at = 0; at < tokens.length / 3;) {
    const kind = tokens[3 * at];
    const embedded = kind === identifier ? taggedTemplate(source, tokens, at, types) : kind === comment ? documentation(source, tokens, at) : null;
    if (embedded) edits.push([embedded.from, embedded.to, splice(source, tokens, embedded, typeOf)]);
    at = embedded && embedded.to > at ? embedded.to : at + 1;
  }
  return edits;
});

export const embed = (source: string, result: PackedTokens): PackedTokens => {
  if (!/\/\*\*|(css|html)[^\w$]*`/.test(source)) return result;
  for (let n = 0; n < 16; n++) {
    const next = once(source, result);
    if (next === result) break;
    result = next;
  }
  return result;
};

export const javascript: Language = run(grammars.javascript as Grammar, [
  trackFrames(javascriptFrames), reservedNames, constants, functionBindings, constBindings, propertyScope, classNames, parameters, namespaces, embed,
]);

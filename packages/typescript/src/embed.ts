import type { PackedTokens } from "@enlumine/core";

export type Language = (source: string) => PackedTokens;

export type Region = [start: number, end: number] | [start: number, end: number, type: string] | [start: number, end: number, tokenStart: number, tokenEnd: number];

export interface Embedded {
  from: number;
  to: number;
  regions: Region[];
  language: Language;
  html?: boolean;
}

export function weave(result: PackedTokens, edit: (typeOf: (name: string) => number) => [number, number, number[]][]): PackedTokens {
  const names = result.token_types.slice(), edits = edit(name => { const id = names.indexOf(name); return id < 0 ? names.push(name) - 1 : id; });
  if (!edits.length) return result;
  const parts: ArrayLike<number>[] = [];
  let at = 0;
  for (const [from, to, pieces] of edits) { parts.push(result.tokens.subarray(3 * at, 3 * from), pieces); at = to; }
  parts.push(result.tokens.subarray(3 * at));
  const tokens = new Uint32Array(parts.reduce((n, part) => n + part.length, 0));
  let written = 0;
  for (const part of parts) { tokens.set(part, written); written += part.length; }
  return { tokens, token_types: names };
}

export function splice(source: string, tokens: Uint32Array, embedded: Embedded, typeOf: (name: string) => number) {
  let virtual = "";
  const starts = embedded.regions.map(region => {
    const start = virtual.length, length = region[1] - region[0];
    if (region.length === 2) virtual += source.slice(region[0], region[1]);
    else if (region.length === 4) virtual += embedded.html && virtual.endsWith("<") ? "x" + " ".repeat(length - 1) : " ".repeat(length);
    return start;
  });
  const sub = embedded.language(virtual), ids = sub.token_types.map(typeOf), pieces: number[] = [];
  embedded.regions.forEach((region, index) => {
    if (region.length === 2) {
      const start = starts[index], end = start + region[1] - region[0];
      for (let t = 0; t < sub.tokens.length; t += 3) {
        const from = Math.max(sub.tokens[t + 1], start), to = Math.min(sub.tokens[t + 2], end);
        if (to > from) pieces.push(ids[sub.tokens[t]], region[0] + from - start, region[0] + to - start);
      }
    } else if (region.length === 4) tokens.subarray(3 * region[2], 3 * region[3]).forEach(value => pieces.push(value));
    else pieces.push(typeOf(region[2]), region[0], region[1]);
  });
  return pieces;
}

export const embedHosts = (hosts: Record<string, Language>) => (source: string, result: PackedTokens): PackedTokens => weave(result, typeOf => {
  const { tokens, token_types: types } = result, count = tokens.length / 3, edits: [number, number, number[]][] = [];
  for (let i = 0; i < count; i++) {
    const kind = tokens[3 * i], host = hosts[types[kind]], first = i, start = tokens[3 * i + 1];
    if (!host) continue;
    let end = tokens[3 * i + 2];
    while (i + 1 < count && tokens[3 * i + 3] === kind && tokens[3 * i + 4] === end) end = tokens[3 * ++i + 2];
    const sub = host(source.slice(start, end)), ids = sub.token_types.map(typeOf), pieces: number[] = [];
    for (let t = 0; t < sub.tokens.length; t += 3) pieces.push(ids[sub.tokens[t]], sub.tokens[t + 1] + start, sub.tokens[t + 2] + start);
    edits.push([first, i + 1, pieces]);
  }
  return edits;
});

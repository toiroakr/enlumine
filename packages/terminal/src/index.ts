import { normalizeTokenKind } from "@enlumine/core";
import type { TokenKind, Tokenizer } from "@enlumine/core";

export type { ColorLevel, Theme, HighlightOptions, HighlightLinesOptions, LineStyles, LineTheme } from './types.js';
import type { ColorLevel, Theme, HighlightOptions, HighlightLinesOptions } from './types.js';

const ansiPalette = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];
const cube = [0, 95, 135, 175, 215, 255];
interface TokenStyles {
  names: string[];
  styles: string[];
}
interface PreparedTheme {
  sequences: Map<TokenKind, string>;
  tokenizers?: WeakMap<Tokenizer, TokenStyles>;
}
const cachedSequences = new WeakMap<Theme, Map<ColorLevel, PreparedTheme>>();

function colorSequence(color: string, level: ColorLevel): string {
  if (!/^#[0-9a-f]{6}$/i.test(color))
    throw new TypeError(`Expected #rrggbb color: ${color}`);
  if (!level) return "";
  const red = parseInt(color.slice(1, 3), 16);
  const green = parseInt(color.slice(3, 5), 16);
  const blue = parseInt(color.slice(5, 7), 16);
  if (level === 3) return `\x1b[38;2;${red};${green};${blue}m`;
  let best = 0;
  let distance = Infinity;
  const count = level === 1 ? 16 : 256;
  for (let i = 0; i < count; i++) {
    let r: number, g: number, b: number;
    if (i < 16) [r, g, b] = ansiPalette[i];
    else if (i < 232) {
      const n = i - 16;
      r = cube[Math.floor(n / 36)];
      g = cube[Math.floor(n / 6) % 6];
      b = cube[n % 6];
    } else r = g = b = 8 + (i - 232) * 10;
    const delta =
      (red - r) ** 2 + (green - g) ** 2 + (blue - b) ** 2;
    if (delta < distance) {
      distance = delta;
      best = i;
    }
  }
  return level === 2
    ? `\x1b[38;5;${best}m`
    : `\x1b[${best < 8 ? 30 + best : 90 + best - 8}m`;
}

function visibleControls(text: string): string {
  return text.replace(
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g,
    (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
}

export function highlight(source: string, options: HighlightOptions): string {
  const level = options.colorLevel ?? 3;
  if (![0, 1, 2, 3].includes(level))
    throw new RangeError(`Invalid color level: ${level}`);
  const theme = options.theme;
  if (!theme) throw new TypeError("A theme is required");
  let prepared = cachedSequences.get(theme)?.get(level);
  if (!prepared) {
    const sequences = new Map<TokenKind, string>();
    for (const [kind, color] of Object.entries(theme)) {
      if (color !== undefined)
        sequences.set(kind as TokenKind, colorSequence(color, level));
    }
    prepared = { sequences };
    if (Object.isFrozen(theme)) {
      prepared.tokenizers = new WeakMap();
      let levels = cachedSequences.get(theme);
      if (!levels) cachedSequences.set(theme, (levels = new Map()));
      levels.set(level, prepared);
    }
  }
  const { sequences } = prepared;
  if (!level || !sequences.size) return visibleControls(source);
  let output = "";
  let active = "";
  const special = /\r\n|[\r\n\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;
  let nextSpecial = special.exec(source);
  let printed = 0;
  function append(content: string, style: string): void {
    if (content) {
      if (style !== active) {
        output += style || "\x1b[39m";
        active = style;
      }
      output += content;
    }
  }
  function appendRange(start: number, end: number, style: string): void {
    let cursor = Math.max(start, printed);
    while (nextSpecial && nextSpecial.index < end) {
      append(source.slice(cursor, nextSpecial.index), style);
      const text = nextSpecial[0];
      if (text[0] === "\r" || text === "\n") {
        if (active) output += "\x1b[39m";
        active = "";
        output += text;
      } else append(`\\x${text.charCodeAt(0).toString(16).padStart(2, "0")}`, style);
      cursor = special.lastIndex;
      nextSpecial = special.exec(source);
    }
    if (cursor < end) append(source.slice(cursor, end), style);
    printed = Math.max(cursor, end);
  }
  const plain = sequences.get("plain") ?? "";
  if (options.tokenizer === null) appendRange(0, source.length, plain);
  else {
    const { tokens, token_types } = options.tokenizer(source);
    let table = prepared.tokenizers?.get(options.tokenizer);
    if (!table) {
      table = { names: [], styles: [] };
      prepared.tokenizers?.set(options.tokenizer, table);
    }
    const { names, styles } = table;
    let cursor = 0;
    let pendingStart = 0;
    let pendingStyle = plain;
    for (let i = 0; i < tokens.length; i += 3) {
      const start = tokens[i + 1];
      const end = tokens[i + 2];
      if (start > cursor && pendingStyle !== plain) {
        appendRange(pendingStart, cursor, pendingStyle);
        pendingStart = cursor;
        pendingStyle = plain;
      }
      const id = tokens[i];
      const kind = token_types[id];
      let style = styles[id];
      if (style === undefined || names[id] !== kind) {
        names[id] = kind;
        style = styles[id] = sequences.get(normalizeTokenKind(kind)) ?? "";
      }
      if (style !== pendingStyle) {
        appendRange(pendingStart, start, pendingStyle);
        pendingStart = start;
        pendingStyle = style;
      }
      cursor = end;
    }
    if (cursor < source.length && pendingStyle !== plain) {
      appendRange(pendingStart, cursor, pendingStyle);
      pendingStart = cursor;
      pendingStyle = plain;
    }
    appendRange(pendingStart, source.length, pendingStyle);
  }
  if (active) output += "\x1b[39m";
  return output;
}

export function highlightLines(lines: readonly string[], options: HighlightLinesOptions): string[] {
  const { styles } = options;
  return options.tokenizeLines(lines).map(({ tokens, token_types }, row) => {
    const line = lines[row];
    let output = "", cursor = 0;
    for (let i = 0; i < tokens.length; i += 3) {
      const start = tokens[i + 1], end = tokens[i + 2], kind = token_types[tokens[i]], style = Object.hasOwn(styles, kind) ? styles[kind] : undefined;
      output += line.slice(cursor, start);
      output += style ? style + line.slice(start, end) + "\x1b[0m" : line.slice(start, end);
      cursor = end;
    }
    return output + line.slice(cursor);
  });
}

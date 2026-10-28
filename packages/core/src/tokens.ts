import type { PackedTokens } from "./core.js";

export type Tokenizer = (source: string) => PackedTokens;
export type LinesTokenizer = (lines: readonly string[]) => PackedTokens[];
export type TokenKind = string;
export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
}

export function normalizeTokenKind(name: string): TokenKind {
  if (name === "boolean" || name === "null") return "literal";
  if (name === "template" || name === "regex" || name === "string_escape")
    return "string";
  return name;
}

export function scan(
  source: string,
  tokenizer: Tokenizer | null,
  target: Token[] | ((kind: TokenKind, start: number, end: number) => void),
): void {
  let kind = "plain";
  let start = 0;
  let end = 0;
  function flush(): void {
    if (end <= start) return;
    if (typeof target === "function") target(kind, start, end);
    else target.push({ kind, start, end });
  }
  function emit(next: string, from: number, to: number): void {
    if (to <= from) return;
    if (next !== kind) {
      flush();
      kind = next;
      start = from;
    }
    end = to;
  }
  if (tokenizer === null) emit("plain", 0, source.length);
  else {
    const result = tokenizer(source);
    let cursor = 0;
    for (let i = 0; i < result.tokens.length; i += 3) {
      const from = result.tokens[i + 1];
      const to = result.tokens[i + 2];
      if (from > cursor) emit("plain", cursor, from);
      emit(normalizeTokenKind(result.token_types[result.tokens[i]]), from, to);
      cursor = to;
    }
    if (cursor < source.length) emit("plain", cursor, source.length);
  }
  flush();
}

export function tokenize(source: string, tokenizer: Tokenizer | null): Token[] {
  const tokens: Token[] = [];
  scan(source, tokenizer, tokens);
  return tokens;
}

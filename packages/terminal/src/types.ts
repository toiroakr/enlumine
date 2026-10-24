import type { TokenKind, Tokenizer } from '@enlumine/core';
export type ColorLevel = 0 | 1 | 2 | 3;
export type Theme = Partial<Record<TokenKind, `#${string}`>>;
export interface HighlightOptions {
  tokenizer: Tokenizer | null;
  colorLevel?: ColorLevel;
  theme: Theme;
}
export interface EditorTheme {
  sql: Readonly<Partial<Record<string, string>>>;
  graphql: Readonly<Partial<Record<string, string>>>;
}

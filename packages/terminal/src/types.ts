import type { LinesTokenizer, TokenKind, Tokenizer } from '@enlumine/core';
export type ColorLevel = 0 | 1 | 2 | 3;
export type Theme = Partial<Record<TokenKind, `#${string}`>>;
export interface HighlightOptions {
  tokenizer: Tokenizer | null;
  colorLevel?: ColorLevel;
  theme: Theme;
}
export type LineStyles = Readonly<Record<string, string | undefined>>;
export interface HighlightLinesOptions {
  tokenizeLines: LinesTokenizer;
  styles: LineStyles;
}
export interface LineTheme {
  sql: LineStyles;
  graphql: LineStyles;
}

import { highlight as render } from "@enlumine/terminal";
import type { HighlightOptions as RenderOptions } from "@enlumine/terminal";
import { resolveLanguage, tokenizerFor } from "./lexer.js";

export { highlightSqlLines } from "@enlumine/sql/editor";
export { highlightGraphqlLines } from "@enlumine/graphql/editor";
export type { ColorLevel, Theme, EditorTheme } from "@enlumine/terminal";
export { resolveLanguage, tokenize } from "./lexer.js";
export type { Language, Token, TokenKind } from "./lexer.js";
export interface HighlightOptions extends Omit<RenderOptions, "tokenizer"> {
  lang: string;
}

export function highlight(source: string, options: HighlightOptions): string {
  const tokenizer = tokenizerFor(resolveLanguage(options.lang));
  return render(source, { ...options, tokenizer });
}

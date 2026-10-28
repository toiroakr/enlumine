import { createHighlighter, type SqlStyles } from "../highlighter.js";
import { dialect, tokenizeTokens } from "./lexical.js";

export type { SqlStyles } from "../highlighter.js";
let highlighter: ReturnType<typeof createHighlighter> | undefined;
export const highlightSqlLines = (lines: readonly string[], styles: SqlStyles): string[] =>
  (highlighter ??= createHighlighter(tokenizeTokens, dialect))(lines, styles);

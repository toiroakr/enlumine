import type { LinesTokenizer } from "@enlumine/core";
import { dialect, tokenizeTokens } from "./lexical.js";
import { createLineTokenizer } from "./tokenize-lines.js";

let tokenizer: LinesTokenizer | undefined;
export const tokenizeLines: LinesTokenizer = lines =>
  (tokenizer ??= createLineTokenizer(tokenizeTokens, dialect))(lines);

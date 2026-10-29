import type { LinesTokenizer } from "@enlumine/core";
import { createLineTokenizer } from "../tokenize-lines.js";
import { dialect, tokenizeTokens } from "./lexical.js";

let tokenizer: LinesTokenizer | undefined;
export const tokenizeLines: LinesTokenizer = lines =>
  (tokenizer ??= createLineTokenizer(tokenizeTokens, dialect))(lines);

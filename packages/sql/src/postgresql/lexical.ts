import { createTokenizer, type Dialect } from "../lexer.js";

export const dialect: Dialect = { quotes: "\"", punctuation: "(){},;.[]", backslash: false, escapePrefix: "eE", hash: false };
const lexer = createTokenizer(dialect);
export const tokenizeTokens = lexer.tokenizeTokens;
export default lexer.tokenize;

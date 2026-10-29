import { createTokenizer, standard, type Dialect } from "./lexer.js";

export const dialect: Dialect = { ...standard, quotes: "\"`[", backslash: true, escapePrefix: "eE", hash: true, sigils: "@:?" };
const lexer = createTokenizer(dialect);
export const tokenizeTokens = lexer.tokenizeTokens;
export default lexer.tokenize;

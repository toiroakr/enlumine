import { createTokenizer, type Dialect } from "./lexer.js";

export const dialect: Dialect = { quotes: "\"`[", punctuation: "(){},;.", backslash: true, hash: true };
const lexer = createTokenizer(dialect);
export const tokenizeTokens = lexer.tokenizeTokens;
export default lexer.tokenize;

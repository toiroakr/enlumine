import { createTokenizer, standard, type Dialect } from "../lexer.js";

export const dialect: Dialect = { ...standard, punctuation: standard.punctuation + "[]", escapePrefix: "eE" };
const lexer = createTokenizer(dialect);
export const tokenizeTokens = lexer.tokenizeTokens;
export default lexer.tokenize;

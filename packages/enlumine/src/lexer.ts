import json from "@enlumine/json";
import typescript from "@enlumine/typescript";
import sql from "@enlumine/sql";
import graphql from "@enlumine/graphql";
import { tokenize as tokenizeWith } from "@enlumine/core";
export type { Token, TokenKind } from "@enlumine/core";
import type { Language } from "./languages.js";
export { resolveLanguage } from "./languages.js";
export type { Language } from "./languages.js";
const lexers = { javascript: typescript, typescript, json, sql, graphql };

export function tokenizerFor(language: Language) {
  return language === "plain" ? null : lexers[language];
}

export function tokenize(source: string, language: Language) {
  return tokenizeWith(source, tokenizerFor(language));
}

import { execute } from "@enlumine/core";
import type { Grammar, Tokenizer } from "@enlumine/core";
import { grammar } from "@twinkleplop/graphql";

const tokenize: Tokenizer = source => execute(source, grammar as Grammar);
export type FragmentContext = "selection" | "fields" | "arguments" | "definitions" | "value";

export function tokenizeFragment(source: string, context: FragmentContext = "selection"): ReturnType<Tokenizer> {
  const table = grammar as Grammar;
  const state = table.entry_states?.[context];
  if (typeof state !== "number") throw new RangeError(`Unknown GraphQL fragment context: ${context}`);
  return execute(source, table, state);
}

export default tokenize;

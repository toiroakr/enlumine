import type { PackedTokens } from "@enlumine/core";

export function promoteFunctionCalls(input: string, result: PackedTokens): PackedTokens & { frames: undefined } {
  const { tokens } = result;
  const token_types = result.token_types.slice();
  const identifier = token_types.indexOf("identifier");
  const punctuation = token_types.indexOf("punctuation");
  let target = token_types.indexOf("function");
  if (target < 0) {
    target = token_types.length;
    token_types.push("function");
  }
  for (let i = 0; i < tokens.length - 3; i += 3) {
    if (tokens[i] !== identifier || tokens[i + 3] !== punctuation) continue;
    const next = i + 3;
    if (input.charCodeAt(tokens[next + 1]) !== 40) continue;
    let depth = 0;
    const limit = Math.min(tokens.length, next + 603);
    search: for (let k = next; k < limit; k += 3) {
      if (tokens[k] !== punctuation) continue;
      for (let p = tokens[k + 1]; p < tokens[k + 2]; p++) {
        const code = input.charCodeAt(p);
        if (code === 40) depth++;
        else if (code === 41 && --depth === 0) {
          tokens[i] = target;
          break search;
        }
      }
    }
  }
  return { tokens, token_types, frames: undefined };
}

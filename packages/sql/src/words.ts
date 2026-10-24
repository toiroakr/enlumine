import type { PackedTokens } from "@enlumine/core";

export function compileWords(groups: string[]): Map<string, number> {
  const words = new Map<string, number>();
  for (let i = 0; i < groups.length; i++) for (const word of groups[i].split(" ")) {
    words.set(word, i + 1);
  }
  return words;
}

export function createWordClassifier(words: ReadonlyMap<string, number>, min: number, max: number): (source: string, result: PackedTokens) => PackedTokens {
  let types: number[] | undefined;
  return (source, result) => {
    const { tokens, token_types } = result;
    if (!tokens.length) return result;
    if (!types) {
      const keyword = token_types.length;
      types = [token_types.indexOf("identifier"), keyword + 1, keyword + 2, keyword];
      token_types.push("keyword", "boolean", "type");
    }
    for (let i = 0; i < tokens.length; i += 3) {
      if (tokens[i] !== types[0]) continue;
      const start = tokens[i + 1], end = tokens[i + 2];
      const length = end - start;
      if (length < min || length > max) continue;
      const first = source.charCodeAt(start);
      if (first === 34 || first === 96 || first === 91) continue;
      const group = words.get(source.slice(start, end).toLowerCase());
      if (group) tokens[i] = types[group];
    }
    return result;
  };
}

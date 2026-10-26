const improvements = [{ from: "identifier", to: "parameter" }];

export function sameTables(actual, expected) {
  const { tokens, token_types } = actual;
  if (tokens.length !== expected.tokens.length || token_types.length !== expected.token_types.length) return false;
  if (token_types.some((name, i) => name !== expected.token_types[i])) return false;
  for (let i = 0; i < tokens.length; i += 3) {
    if (tokens[i + 1] !== expected.tokens[i + 1] || tokens[i + 2] !== expected.tokens[i + 2]) return false;
    if (tokens[i] === expected.tokens[i]) continue;
    const from = token_types[expected.tokens[i]], to = token_types[tokens[i]];
    if (!improvements.some(rule => rule.from === from && rule.to === to)) return false;
  }
  return true;
}

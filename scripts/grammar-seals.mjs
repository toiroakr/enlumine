export function removePatternSeals(grammar) {
  if (!grammar.seal_flags) return grammar;
  const flags = grammar.seal_flags.slice();
  let removed = false;
  for (let state = 0; state < grammar.probe_mask.length; state++) {
    const single = new Set(grammar.char_maps.subarray(state * 128, (state + 1) * 128));
    const ranges = grammar.non_ascii_by_state[state];
    if (ranges) for (let i = 2; i < ranges.length; i += 3) single.add(ranges[i]);
    for (let rule = 0; rule < 256; rule++) {
      const index = state * 256 + rule;
      if (flags[index] && !single.has(rule)) {
        flags[index] = 0;
        removed = true;
      }
    }
  }
  if (!removed) return grammar;
  const remaining = flags.some(Boolean);
  const result = { ...grammar, has_seals: grammar.has_seals && (remaining || !!grammar.fallback_seal_flags?.some(Boolean)) };
  if (remaining) result.seal_flags = flags;
  else delete result.seal_flags;
  return result;
}

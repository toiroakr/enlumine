export interface Pattern {
  codes: ArrayLike<number> | string;
  length: number;
  rule_idx: number;
  boundary?: boolean;
  delimited?: {
    start: string;
    open: string;
    close: string;
    end: string;
    max_length: number;
    exclude: string;
  };
}

export interface Grammar {
  transitions: Uint16Array;
  char_maps: Uint16Array;
  token_types: string[];
  patterns_by_state: ((Pattern[] | null)[] | undefined)[];
  fallback_transitions: Uint16Array;
  non_ascii_by_state: (Int32Array | undefined)[];
  probe_mask: Uint8Array;
  probe_fallbacks: Map<number, number>;
  boundary_flags?: Uint8Array;
  run_kinds: Uint8Array;
  has_seals: boolean;
  seal_flags?: Uint8Array;
  fallback_seal_flags?: Uint8Array;
  entry_states?: Record<string, number>;
}

export interface PackedTokens {
  tokens: Uint32Array;
  token_types: string[];
}
let scratch = new Uint32Array(4096);
function probeKey(position: number, state: number, rule: number, states: number): number {
  return (position * states + state) * 256 + rule;
}

function word(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 95 ||
    code === 36
  );
}

export function execute(input: string, grammar: Grammar, initialState = 0): PackedTokens {
  const slots = input.length * 3;
  if (slots > scratch.length && slots <= 1048576)
    scratch = new Uint32Array(
      Math.min(1048576, Math.max(slots, scratch.length * 2)),
    );
  const output = slots <= scratch.length ? scratch : new Uint32Array(slots);
  let count = 0;
  let stack: number[] = initialState === 0 ? [] : [0];
  let state = initialState;
  let position = 0;
  let lastType = -1;
  let advanced = -1;
  let probe:
    | { position: number; state: number; stack: number[]; rule: number }
    | undefined;
  let failed: Set<number> | undefined;
  const states = grammar.probe_mask.length;
  while (true) {
    if (position >= input.length) {
      if (!probe || !grammar.probe_mask[state]) break;
      const fallback = grammar.probe_fallbacks.get(state);
      position = probe.position;
      stack = probe.stack;
      if (fallback !== undefined) {
        stack.push(probe.state);
        state = fallback;
      } else {
        (failed ??= new Set()).add(probeKey(position, probe.state, probe.rule, states));
        state = probe.state;
      }
      probe = undefined;
      continue;
    }
    if (position > advanced) {
      if (failed?.size) failed.clear();
      advanced = position;
    }
    const code = input.charCodeAt(position);
    const probing = !!grammar.probe_mask[state];
    let rule = 65535;
    let length = 0;
    let fallback = false;
    const buckets = grammar.patterns_by_state[state];
    if (code < 128) {
      const patterns = buckets?.[code];
      if (patterns) for (let p = 0; p < patterns.length; p++) {
        const pattern = patterns[p];
        const { codes, length: patternLength, rule_idx: patternRule, delimited: delimiter } = pattern;
        if (position + patternLength > input.length) continue;
        let matches = true;
        for (let i = 1; i < patternLength; i++) {
          const expected =
            typeof codes === "string"
              ? codes.charCodeAt(i)
              : codes[i];
          if (input.charCodeAt(position + i) !== expected) {
            matches = false;
            break;
          }
        }
        if (
          !matches ||
          (pattern.boundary &&
            word(input.charCodeAt(position + patternLength)))
        )
          continue;
        if (failed?.size && failed.has(probeKey(position, state, patternRule, states)))
          continue;
        let span = patternLength;
        if (delimiter) {
          const start = position + delimiter.start.length;
          let cursor = start;
          span = 0;
          while (
            cursor <= start + delimiter.max_length &&
            cursor < input.length
          ) {
            if (input.startsWith(delimiter.open, cursor)) {
              const closing =
                delimiter.close + input.slice(start, cursor) + delimiter.end;
              const end = input.indexOf(
                closing,
                cursor + delimiter.open.length,
              );
              span = (end < 0 ? input.length : end + closing.length) - position;
              break;
            }
            const current = input.charCodeAt(cursor);
            if (
              current < 33 ||
              current > 126 ||
              delimiter.exclude.includes(input[cursor])
            )
              break;
            cursor++;
          }
        }
        if (!span) continue;
        rule = patternRule;
        length = span;
        break;
      }
      if (rule === 65535) {
        rule = grammar.char_maps[state * 128 + code];
        if (
          grammar.boundary_flags?.[state * 256 + rule] &&
          word(input.charCodeAt(position + 1))
        )
          rule = 65535;
        if (failed?.size && failed.has(probeKey(position, state, rule, states))) rule = 65535;
      }
      if (rule === 65535) {
        position++;
        continue;
      }
    } else {
      const ranges = grammar.non_ascii_by_state[state];
      if (ranges)
        for (let i = 0; i < ranges.length; i += 3) {
          if (code >= ranges[i] && code <= ranges[i + 1]) {
            rule = ranges[i + 2];
            break;
          }
        }
      fallback = rule === 65535;
      if (fallback && !ranges?.length && !probing && !failed?.size && !grammar.fallback_seal_flags?.[state]) {
        const index = state * 3;
        const next = grammar.fallback_transitions[index];
        const type = grammar.fallback_transitions[index + 1];
        if (type !== 65535 && grammar.fallback_transitions[index + 2] === 0 &&
            (next === 65535 || next === state)) {
          const start = position++;
          while (position < input.length && input.charCodeAt(position) >= 128) position++;
          if (type === lastType && start === output[count - 1]) output[count - 1] = position;
          else {
            output[count++] = type;
            output[count++] = start;
            output[count++] = position;
          }
          lastType = type;
          continue;
        }
      }
    }
    const index = fallback ? state * 3 : (state * 256 + rule) * 3;
    const transitions = fallback
      ? grammar.fallback_transitions
      : grammar.transitions;
    const next = transitions[index];
    const type = transitions[index + 1];
    const operation = transitions[index + 2];
    const run =
      !fallback && code < 128 && !length && !failed?.size
        ? grammar.run_kinds[state * 256 + rule]
        : 0;
    if (run) {
      const start = position++;
      while (position < input.length) {
        const next = input.charCodeAt(position);
        if (
          next >= 128 ||
          grammar.char_maps[state * 128 + next] !== rule ||
          buckets?.[next]
        )
          break;
        position++;
      }
      if (run !== 2) {
        if (type === lastType && start === output[count - 1])
          output[count - 1] = position;
        else {
          output[count++] = type;
          output[count++] = start;
          output[count++] = position;
        }
        lastType = type;
      }
      continue;
    }
    let target = state;
    if (next !== 65535) target = next;
    else if (operation === 2 && stack.length) target = stack[stack.length - 1];
    const targetProbe = !!grammar.probe_mask[target];
    if (!probing && targetProbe) {
      if (
        failed?.size &&
        failed.has(probeKey(position, state, fallback ? 255 : rule, states))
      ) {
        position++;
        continue;
      }
      probe = {
        position,
        state,
        stack: stack.slice(),
        rule: fallback ? 255 : rule,
      };
    }
    if (!probing && type !== 65535) {
      const end = position + (length || 1);
      const sealed =
        grammar.has_seals &&
        (fallback
          ? grammar.fallback_seal_flags?.[state]
          : grammar.seal_flags?.[state * 256 + rule]);
      if (!length && !sealed && type === lastType && position === output[count - 1])
        output[count - 1] = end;
      else {
        output[count++] = type;
        output[count++] = position;
        output[count++] = end;
      }
      lastType = type;
      position = end;
    } else if (operation !== 2 || (next !== 65535 && length > 0))
      position += length || 1;
    if (operation === 1) stack.push(state);
    else if (operation === 2 && next === 65535 && stack.length) stack.pop();
    state = target;
    if (probing && !targetProbe && probe) {
      position = probe.position;
      stack = probe.stack;
      if (operation === 1) stack.push(probe.state);
      probe = undefined;
    }
  }
  return { tokens: output.slice(0, count), token_types: grammar.token_types };
}

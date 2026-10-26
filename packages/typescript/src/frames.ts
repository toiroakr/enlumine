import type { PackedTokens } from "@enlumine/core";

interface Text { codes: number[] }
interface Scan {
  over: { type: string; texts: Text[] | null; chars: number[] | null }[];
  to_type: string;
  to_texts: Text[] | null;
  to_last_chars: number[] | null;
  to_prev_chars: number[] | null;
  max: number;
  skip_groups: string | null;
}
interface Rule { type: string; texts: Text[] | null; last_chars: number[] | null; in_kind_ids: number[] | null; scan: Scan | null; kind_id: number }
interface Spec {
  punct_type: string;
  paren_open: number; paren_close: number; brace_open: number; brace_close: number; bracket_open: number; bracket_close: number;
  at_start_reset_chars: number[];
  at_start_transparent: string[];
  at_start_transparent_texts: { type: string; texts: Text[] }[];
  rearm_kind_ids: number[] | null;
  brace_kinds: {
    kind_names: string[];
    markers: { type: string; text: Text; kind_id: number }[];
    pending_in_angles_kind: number;
    angle_type: string | null;
    angle_open: Text | null;
    angle_closes: { text: Text; pops: number }[];
    angle_reset_chars: number[];
    marker_reset_chars: number[];
    prev_rules: Rule[];
    default_kind: number;
    start_kind: number;
  };
  ternary_qmark_type: string | null;
  ternary_qmark_text: Text | null;
  ternary_colon_code: number;
  optional_kind_ids: number[] | null;
  stmt_flag_names: string[];
  stmt_rules: { type: string; text: Text; arm_mask: number; clear_mask: number }[];
  stmt_clear_char_codes: number[];
  stmt_clear_char_masks: number[];
  stmt_brace_close_clear_mask: number;
  signals_enabled: boolean;
}

interface Word { transparent?: boolean; marker?: number; delta?: number; qmark?: boolean; stmt?: { arm_mask: number; clear_mask: number } }

const closer = (c: number) => c === 41 || c === 93 || c === 125;
const opener = (c: number) => c === 40 || c === 91 || c === 123;
const str = (text: Text) => String.fromCharCode(...text.codes);

function tables(spec: Spec, types: string[]) {
  const id = (name: string | null) => types.indexOf(name as string);
  const kinds = spec.brace_kinds, words: (Map<string, Word> | undefined)[] = [];
  const word = (type: string | null, text: Text): Word => {
    const at = id(type), key = str(text);
    if (at < 0) return {};
    const map = words[at] ??= new Map();
    if (!map.has(key)) map.set(key, {});
    return map.get(key)!;
  };
  for (const entry of spec.at_start_transparent_texts) for (const text of entry.texts) word(entry.type, text).transparent = true;
  for (const marker of kinds.markers) word(marker.type, marker.text).marker ??= marker.kind_id;
  for (const close of kinds.angle_closes) word(kinds.angle_type, close.text).delta ??= -close.pops;
  if (kinds.angle_open) word(kinds.angle_type, kinds.angle_open).delta = 1;
  if (spec.signals_enabled) {
    if (spec.ternary_qmark_text) word(spec.ternary_qmark_type, spec.ternary_qmark_text).qmark = true;
    for (const rule of spec.stmt_rules) word(rule.type, rule.text).stmt ??= rule;
  }
  const prepare = (rule: Rule) => ({
    ...rule, texts: rule.texts && rule.texts.map(str),
    scan: rule.scan && {
      ...rule.scan, to_texts: rule.scan.to_texts && rule.scan.to_texts.map(str),
      over: types.map(name => {
        const entries = rule.scan!.over.filter(over => over.type === name);
        return entries.length ? {
          any: entries.some(over => !over.texts && !over.chars),
          texts: entries.flatMap(over => over.texts ?? []).map(str),
          chars: entries.some(over => over.chars) && entries.flatMap(over => over.chars ?? []),
        } : null;
      }),
      to_type_id: id(rule.scan.to_type), group_type_id: id(rule.scan.skip_groups),
    },
  });
  const ruleLists = types.map(() => [] as ReturnType<typeof prepare>[]);
  for (const rule of kinds.prev_rules) if (id(rule.type) >= 0) ruleLists[id(rule.type)].push(prepare(rule));
  return { punct: id(spec.punct_type), comment: id("comment"), keyword: id("keyword"), operator: id("operator"), words, ruleLists, transparent: types.map(name => spec.at_start_transparent.includes(name)) };
}

type Tables = ReturnType<typeof tables>;
type PreparedScan = NonNullable<Tables["ruleLists"][number][number]["scan"]>;

export function trackFrames(spec: Spec) {
  const kinds = spec.brace_kinds, cache = new WeakMap<string[], Tables>();
  const { rearm_kind_ids: rearm, optional_kind_ids: optional } = spec;
  const opens = [spec.paren_open, spec.brace_open, spec.bracket_open], closes = [spec.paren_close, spec.brace_close, spec.bracket_close];
  const memberKinds = ["class", "interface", "type_literal"].reduce((mask, name) => mask | 1 << kinds.kind_names.indexOf(name), 0);
  const objectKind = kinds.kind_names.indexOf("object"), aliasBit = 1 << spec.stmt_flag_names.indexOf("alias_head");
  const continuation = new Set("extends in instanceof as is satisfies implements".split(" "));
  const typeEnd = new Set("null undefined void this never unknown any object symbol bigint string number boolean".split(" "));
  return (source: string, input: PackedTokens) => {
    let table = cache.get(input.token_types);
    if (!table) cache.set(input.token_types, table = tables(spec, input.token_types));
    const { punct, comment, keyword, operator, words, ruleLists, transparent } = table;
    const tokens = input.tokens, count = tokens.length / 3;
    const active = new Uint32Array(count), atStart = new Uint8Array(count), signals = new Uint8Array(count), asi = new Uint8Array(count), closedAngle = new Uint8Array(count);
    const frames = [{ bracket: -1, kind: 0, enter_idx: -1, parent: -1 }];
    const stack: number[][] = [], counts = [0, 0, 0];
    let current = 0, start = 1, ternary = 0, statement = 0, afterQmark = false, angles = 0, marker = -1, markerAt = "", last = -1;
    const where = () => counts + "," + angles;
    const lineBreak = (at: number, to: number) => {
      for (let q = tokens[3 * at + 2]; q < to; q++) { const c = source.charCodeAt(q); if (c === 10 || c === 13 || c === 0x2028 || c === 0x2029) return true; }
      return false;
    };
    const completes = (at: number) => {
      const kind = tokens[3 * at], end = tokens[3 * at + 2];
      if (kind === punct) { const c = source.charCodeAt(end - 1); return c === 41 || c === 93 || c === 125; }
      return kind === operator ? closedAngle[at] === 1 : kind !== keyword || typeEnd.has(source.slice(tokens[3 * at + 1], end));
    };
    const named = (at: number) => {
      let next = at + 1;
      while (next < count && tokens[3 * next] === comment) next++;
      const c = next < count ? source[tokens[3 * next + 1]] : "";
      return tokens[3 * next] === punct ? c === ":" : tokens[3 * next] === operator && c === "?";
    };
    const begins = (at: number, kind: number, from: number, to: number) => kind === punct ? source.charCodeAt(from) === 91 : kind !== operator && (kind !== keyword || !continuation.has(source.slice(from, to)) || named(at));
    const skip = (at: number) => {
      while (at >= 0 && tokens[3 * at] === comment) at--;
      return at;
    };
    const group = (type: number, at: number, end: number): [number, number] | null => {
      let depth = 0, token = at, char = end - 1;
      for (let i = 0; i < 256; i++) {
        if (tokens[3 * token] === type)
          for (; char >= tokens[3 * token + 1]; char--) {
            const c = source.charCodeAt(char);
            if (closer(c)) depth++;
            else if (opener(c) && --depth === 0) return [token, char];
          }
        token = skip(token - 1);
        if (token < 0) return null;
        char = tokens[3 * token + 2] - 1;
      }
      return null;
    };
    const landed = (rule: PreparedScan, token: number, end: number) => {
      const begin = tokens[3 * token + 1], before = skip(token - 1);
      return (!rule.to_texts || rule.to_texts.includes(source.slice(begin, end)))
        && (!rule.to_last_chars || rule.to_last_chars.includes(source.charCodeAt(end - 1)))
        && (!rule.to_prev_chars || (end - 2 >= begin || before >= 0) && rule.to_prev_chars.includes(source.charCodeAt(end - 2 >= begin ? end - 2 : tokens[3 * before + 2] - 1)));
    };
    const scan = (rule: PreparedScan, token: number, char: number): boolean => {
      for (let i = 0; i < rule.max; i++) {
        if (char < 0 && (token = skip(token)) < 0) return false;
        const kind = tokens[3 * token], end = char >= 0 ? char : tokens[3 * token + 2];
        char = -1;
        if (kind === rule.to_type_id && landed(rule, token, end)) return true;
        if (kind === rule.group_type_id && closer(source.charCodeAt(end - 1))) {
          const found = group(kind, token, end);
          if (!found) return false;
          token = found[0];
          if (found[1] > tokens[3 * token + 1]) char = found[1]; else token--;
          continue;
        }
        const over = rule.over[kind], text = source.slice(tokens[3 * token + 1], end), chars = over && over.chars;
        if (!over || !over.any && !over.texts.includes(text) && !(chars && text.split("").every(c => chars.includes(c.charCodeAt(0))))) return false;
        token--;
      }
      return false;
    };
    const braceKind = (at: number, offset: number, from: number) => {
      const here = offset > from;
      let kind = punct, text = "", lastChar = -1;
      if (here) text = String.fromCharCode(lastChar = source.charCodeAt(offset - 1));
      else if (last < 0) return kinds.start_kind;
      else [kind, text, lastChar] = [tokens[3 * last], source.slice(tokens[3 * last + 1], tokens[3 * last + 2]), source.charCodeAt(tokens[3 * last + 2] - 1)];
      for (const rule of ruleLists[kind])
        if ((rule.texts ? rule.texts.includes(text) : !rule.last_chars || rule.last_chars.includes(lastChar))
          && (!rule.in_kind_ids || rule.in_kind_ids.includes(frames[current].kind))
          && (!rule.scan || (rule.scan.group_type_id === kind && closer(lastChar) ? scan(rule.scan, here ? at : last, here ? offset : -1) : scan(rule.scan, here ? last : last - 1, -1)))) return rule.kind_id;
      return kinds.default_kind;
    };
    const pop = (mask: number) => {
      const saved = stack.pop();
      if (saved) [current, ternary, statement] = [saved[0], saved[1], saved[2] & ~mask];
      return !!saved;
    };
    for (let t = 0; t < count; t++) {
      const kind = tokens[3 * t], from = tokens[3 * t + 1], to = tokens[3 * t + 2], trivia = kind === comment;
      const word = words[kind]?.get(source.slice(from, to));
      let signal = 0, qmark = false;
      if (!start && !trivia && last >= 0 && angles === 0 && (memberKinds >> frames[current].kind & 1 || frames[current].kind === objectKind && stack.length && stack[stack.length - 1][2] & aliasBit) && lineBreak(last, from) && completes(last) && begins(t, kind, from, to)) start = asi[t] = 1;
      atStart[t] = start;
      if (word) {
        if (word.marker !== undefined) { marker = word.marker; markerAt = where(); }
        if (word.delta! < 0 && angles > 0) closedAngle[t] = 1;
        angles = Math.max(0, angles + (word.delta ?? 0));
        if (word.qmark && !(optional && atStart[last] === 1 && optional.includes(frames[current].kind))) { ternary++; qmark = true; }
        if (word.stmt) statement = (statement | word.stmt.arm_mask) & ~word.stmt.clear_mask;
      }
      if (kind === punct) {
        for (let q = from; q < to; q++) {
          const c = source.charCodeAt(q), open = opens.indexOf(c), close = closes.indexOf(c);
          if (open >= 0) {
            let brace = open ? 2 : 1;
            if (open === 1) {
              if (marker >= 0 && angles > 0) brace = kinds.pending_in_angles_kind < 0 ? kinds.default_kind : kinds.pending_in_angles_kind;
              else if (marker >= 0 && !counts[0] && !counts[2]) { brace = marker; marker = -1; }
              else brace = braceKind(t, q, from);
            }
            frames.push({ bracket: open, kind: brace, enter_idx: t, parent: current });
            stack.push([current, ternary, statement]);
            current = frames.length - 1; ternary = statement = 0;
            counts[open]++;
            start = +(open === 1);
          } else if (close >= 0) {
            if (close === 1) angles = 0;
            const popped = pop(close === 1 ? spec.stmt_brace_close_clear_mask : 0);
            if (counts[close] > 0) counts[close]--;
            start = +(close === 1 && popped && !!rearm && rearm.includes(frames[current].kind));
          } else {
            if (c === spec.ternary_colon_code && ternary > 0) { ternary--; if (!(afterQmark && q === from)) signal |= 1; }
            else { const e = spec.stmt_clear_char_codes.indexOf(c); if (e >= 0) statement &= ~spec.stmt_clear_char_masks[e]; }
            if (kinds.angle_reset_chars.includes(c)) angles = 0;
            if (marker >= 0 && markerAt === where() && kinds.marker_reset_chars.includes(c)) marker = -1;
            start = +spec.at_start_reset_chars.includes(c);
          }
        }
      } else if (!trivia && !transparent[kind] && !word?.transparent) start = 0;
      if (!trivia) { last = t; afterQmark = qmark; }
      active[t] = current;
      signals[t] = signal | statement << 1;
    }
    return {
      tokens, token_types: input.token_types,
      frames: { active_frame: active, at_start: atStart, asi, frames, kind_names: kinds.kind_names, signals: spec.signals_enabled ? signals : new Uint8Array(), flag_names: spec.stmt_flag_names },
    } as unknown as PackedTokens;
  };
}

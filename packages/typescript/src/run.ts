import type { PackedTokens } from "@enlumine/core";
import type { Claim, Claims } from "./claims.js";

type Stage = { __claim?: Claim } & ((...args: any[]) => any);

export function reclassify(stages: Stage[]) {
  const plan: (Stage | Claim[])[] = [];
  for (const stage of stages) {
    const last = plan[plan.length - 1];
    if (stage.__claim) Array.isArray(last) ? last.push(stage.__claim) : plan.push([stage.__claim]);
    else plan.push(stage);
  }
  const list: number[] = [], claims: Claims = { emit: (index, type, precedence) => { list.push(index, type, precedence); } };
  return (source: string, input: PackedTokens): PackedTokens => {
    let result: any = input;
    for (const step of plan) {
      if (!Array.isArray(step)) {
        const frames = result.frames, length = result.tokens.length;
        result = step(source, result);
        if (result.frames === undefined && frames !== undefined && result.tokens.length === length)
          result = { tokens: result.tokens, token_types: result.token_types, overlays: result.overlays, frames };
        continue;
      }
      const types = result.token_types.slice();
      list.length = 0;
      for (const claim of step) claim(source, result.tokens, types, claims, result.frames);
      let tokens = result.tokens;
      if (list.length) {
        tokens = new Uint32Array(tokens);
        const best = new Int32Array(tokens.length / 3).fill(-1);
        for (let i = 0; i < list.length; i += 3) if (list[i + 2] > best[list[i]]) { best[list[i]] = list[i + 2]; tokens[3 * list[i]] = list[i + 1]; }
      }
      result = { tokens, token_types: types, frames: result.frames };
    }
    return result;
  };
}

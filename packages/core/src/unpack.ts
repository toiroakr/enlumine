import { brotliDecompressSync } from "node:zlib";
import type { Grammar } from "./core.js";

function unpack(
  runs: number[],
  bits: 8 | 16 | 32,
): Uint8Array | Uint16Array | Int32Array {
  let length = 0;
  for (let i = 0; i < runs.length; i += 2) length += runs[i];
  const values =
    bits === 8
      ? new Uint8Array(length)
      : bits === 16
        ? new Uint16Array(length)
        : new Int32Array(length);
  let offset = 0;
  for (let i = 0; i < runs.length; i += 2) {
    if (runs[i + 1]) values.fill(runs[i + 1], offset, offset + runs[i]);
    offset += runs[i];
  }
  return values;
}

interface PackedValue {
  $: [8 | 16 | 32, number[]] | [0, [unknown, unknown][]];
}

function revive(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item && typeof item === "object") value[i] = revive(item);
    }
    return value;
  }
  if ("$" in value) {
    const [bits, data] = (value as PackedValue).$;
    return bits ? unpack(data as number[], bits) : new Map(revive(data) as [unknown, unknown][]);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const item = record[key];
    if (item && typeof item === "object") record[key] = revive(item);
  }
  return value;
}

export function loadGrammar<T extends Grammar | Grammar[] = Grammar>(encoded: string): T {
  const json = brotliDecompressSync(Buffer.from(encoded, "base64")).toString();
  return revive(JSON.parse(json)) as T;
}

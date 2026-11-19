import type { Grammar } from "./core.js";

export function loadGrammar<T extends Grammar | Grammar[] = Grammar>(_encoded: string): T {
  throw new Error("Packed grammars are brotli-compressed and can only be loaded in Node.js.");
}

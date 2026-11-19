import type { Theme } from "./types.js";

export function themeCss(colors: Theme): string {
  const kinds = Object.entries(colors).map(([kind, color]) => [kind.replaceAll("_", "-"), color]);
  const variables = kinds.map(([kind, color]) => `--enl-${kind}:${color};`).join("");
  const rules = kinds.map(([kind]) => `.enlumine .enl-${kind}{color:var(--enl-${kind})}`).join("");
  return `.enlumine{${variables}}${rules}`;
}

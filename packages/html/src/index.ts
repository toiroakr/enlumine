import { tokenize } from "@enlumine/core";
import type { Tokenizer } from "@enlumine/core";

export interface HighlightOptions {
  tokenizer: Tokenizer | null;
  classPrefix?: string;
}

const entities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => entities[char]);
}

export function highlight(source: string, options: HighlightOptions): string {
  if (options.tokenizer === null) return escapeHtml(source);
  const prefix = options.classPrefix ?? "enl-";
  let output = "";
  for (const { kind, start, end } of tokenize(source, options.tokenizer)) {
    const text = escapeHtml(source.slice(start, end));
    output +=
      kind === "plain" ? text : `<span class="${prefix}${kind.replaceAll("_", "-")}">${text}</span>`;
  }
  return output;
}

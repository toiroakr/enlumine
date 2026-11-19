import { scan } from "@enlumine/core";
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
  "\r": "&#13;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"'\r]/g, (char) => entities[char]);
}

export function highlight(source: string, options: HighlightOptions): string {
  if (options.tokenizer === null) return escapeHtml(source);
  const prefix = options.classPrefix ?? "enl-";
  let output = "";
  scan(source, options.tokenizer, (kind, start, end) => {
    const text = escapeHtml(source.slice(start, end));
    output +=
      kind === "plain"
        ? text
        : `<span class="${escapeHtml(prefix + kind.replaceAll("_", "-"))}">${text}</span>`;
  });
  return output;
}

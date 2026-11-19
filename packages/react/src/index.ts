import { scan } from "@enlumine/core";
import type { Tokenizer } from "@enlumine/core";
import { createElement, forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export interface HighlightProps
  extends Omit<ComponentPropsWithoutRef<"pre">, "children" | "dangerouslySetInnerHTML"> {
  source: string;
  tokenizer: Tokenizer | null;
  classPrefix?: string;
}

export const Highlight = forwardRef<HTMLPreElement, HighlightProps>(function Highlight(
  { source, tokenizer, classPrefix = "enl-", className, ...rest },
  ref,
) {
  const children: ReactNode[] = [];
  scan(source, tokenizer, (kind, start, end) => {
    const text = source.slice(start, end);
    children.push(
      kind === "plain"
        ? text
        : createElement("span", { key: children.length, className: classPrefix + kind.replaceAll("_", "-") }, text),
    );
  });
  return createElement(
    "pre",
    { ...rest, ref, className: className ? `enlumine ${className}` : "enlumine" },
    createElement("code", null, children),
  );
});

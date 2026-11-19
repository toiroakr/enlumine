import { scan } from "@enlumine/core";
import type { Tokenizer } from "@enlumine/core";
import { createElement } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

export interface HighlightProps extends Omit<ComponentProps<"pre">, "children"> {
  source: string;
  tokenizer: Tokenizer | null;
  classPrefix?: string;
}

export function Highlight({
  source,
  tokenizer,
  classPrefix = "enl-",
  className,
  ...rest
}: HighlightProps): ReactElement {
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
    { ...rest, className: className ? `enlumine ${className}` : "enlumine" },
    createElement("code", null, children),
  );
}

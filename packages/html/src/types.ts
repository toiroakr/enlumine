import type { TokenKind } from "@enlumine/core";

export type Theme = Partial<Record<TokenKind, `#${string}`>>;

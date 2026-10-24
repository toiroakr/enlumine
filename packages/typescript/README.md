# @enlumine/typescript

TypeScript tokenization and reclassification with embedded language data.

Requires Node.js 22 or later.

```ts
import typescript from "@enlumine/typescript";

const { tokens, token_types } = typescript("const answer: number = 42;");
```

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

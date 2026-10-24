# @enlumine/terminal

ANSI rendering with explicit tokenizers and separately imported themes.

Requires Node.js 22 or later.

```ts
import { highlight } from "@enlumine/terminal";
import dark from "@enlumine/terminal/themes/dark";
import sql from "@enlumine/sql";

const output = highlight("SELECT 42;", { tokenizer: sql, theme: dark });
```

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

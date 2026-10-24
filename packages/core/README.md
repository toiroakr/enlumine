# @enlumine/core

Grammar execution and normalized token ranges.

Requires Node.js 22 or later.

```ts
import { tokenize } from "@enlumine/core";
import sql from "@enlumine/sql";

const ranges = tokenize("SELECT 42;", sql);
```

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

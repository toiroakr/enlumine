# @enlumine/sql

SQL tokenization and line-oriented ANSI rendering.

Requires Node.js 22 or later.

```ts
import sql from "@enlumine/sql";
import { highlightSqlLines } from "@enlumine/sql/editor";
import styles from "@enlumine/sql/themes/ansi";

const packed = sql("SELECT 42;");
const lines = highlightSqlLines(["SELECT 42;"], styles);
```

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

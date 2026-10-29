# @enlumine/sql

SQL tokenization, including line-by-line tokenization for editors.

Requires Node.js 22 or later.

```ts
import sql, { tokenizeLines } from "@enlumine/sql";

const packed = sql("SELECT 42;");
const lines = tokenizeLines(["SELECT 42 /* comment", "end */"]);
```

Color the result with `highlightLines` from `@enlumine/terminal`. Import `@enlumine/sql/postgresql` to apply only PostgreSQL's lexical rules (quoting, brackets, operators and parameters); the default entry accepts the quoting of every supported dialect.

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

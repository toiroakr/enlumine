# enlumine

Terminal syntax highlighting and a CLI for JSON, TypeScript, SQL, GraphQL, and plain text.

Requires Node.js 22 or later.

```ts
import { highlight } from "enlumine";
import dark from "@enlumine/terminal/themes/dark";

const output = highlight("SELECT 42;", { lang: "sql", theme: dark });
```

```sh
enlumine query.sql --theme dark --color truecolor
```

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

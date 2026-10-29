# @enlumine/graphql

GraphQL document, fragment, and lexical tokenization, including line-by-line tokenization for editors.

Requires Node.js 22 or later.

```ts
import graphql, { tokenizeFragment } from "@enlumine/graphql";
import { tokenizeLexically, tokenizeLines } from "@enlumine/graphql/lexical";

const document = graphql("query { name }");
const fragment = tokenizeFragment("user(id: $id) { name }");
const lexical = tokenizeLexically("query { name }");
const lines = tokenizeLines(["query { name }"]);
```

Color the lines with `highlightLines` from `@enlumine/terminal`.

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

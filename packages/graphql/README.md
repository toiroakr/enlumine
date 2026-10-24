# @enlumine/graphql

GraphQL document, fragment, and lexical tokenization with line-oriented ANSI rendering.

Requires Node.js 22 or later.

```ts
import graphql, { tokenizeFragment } from "@enlumine/graphql";
import { tokenizeLexically } from "@enlumine/graphql/lexical";
import { highlightGraphqlLines } from "@enlumine/graphql/editor";
import styles from "@enlumine/graphql/themes/ansi";

const document = graphql("query { name }");
const fragment = tokenizeFragment("user(id: $id) { name }");
const lexical = tokenizeLexically("query { name }");
const lines = highlightGraphqlLines(["query { name }"], styles);
```

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for API details, language limits, CLI options, and independent package usage. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

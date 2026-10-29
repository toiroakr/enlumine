# @enlumine/core

## 0.2.0

### Minor Changes

- acce515: Move line-by-line ANSI highlighting into `@enlumine/terminal`. `@enlumine/sql` and `@enlumine/graphql/lexical` now export `tokenizeLines`, which returns the tokens of each line, and `highlightLines(lines, { tokenizeLines, styles })` from `@enlumine/terminal` colors them. The output is unchanged.
  
  Migrate `highlightSqlLines(lines, styles)` to `highlightLines(lines, { tokenizeLines, styles })` with `tokenizeLines` from `@enlumine/sql`, and `highlightGraphqlLines` the same way with `tokenizeLines` from `@enlumine/graphql/lexical`. The `@enlumine/sql/editor`, `@enlumine/sql/themes/ansi`, `@enlumine/graphql/editor` and `@enlumine/graphql/themes/ansi` entries are removed; use `@enlumine/terminal/themes/ansi` for the styles. The `EditorTheme` type is renamed `LineTheme`, and `enlumine` re-exports `highlightLines` instead of `highlightSqlLines` and `highlightGraphqlLines`.

## 0.1.0

### Minor Changes

- 791e9cc: Introduce independent terminal highlighting packages, opt-in themes, SQL and GraphQL line rendering, and the enlumine CLI.

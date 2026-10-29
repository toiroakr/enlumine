# enlumine

## 0.2.0

### Minor Changes

- acce515: Move line-by-line ANSI highlighting into `@enlumine/terminal`. `@enlumine/sql` and `@enlumine/graphql/lexical` now export `tokenizeLines`, which returns the tokens of each line, and `highlightLines(lines, { tokenizeLines, styles })` from `@enlumine/terminal` colors them. The output is unchanged.
  
  Migrate `highlightSqlLines(lines, styles)` to `highlightLines(lines, { tokenizeLines, styles })` with `tokenizeLines` from `@enlumine/sql`, and `highlightGraphqlLines` the same way with `tokenizeLines` from `@enlumine/graphql/lexical`. The `@enlumine/sql/editor`, `@enlumine/sql/themes/ansi`, `@enlumine/graphql/editor` and `@enlumine/graphql/themes/ansi` entries are removed; use `@enlumine/terminal/themes/ansi` for the styles. The `EditorTheme` type is renamed `LineTheme`, and `enlumine` re-exports `highlightLines` instead of `highlightSqlLines` and `highlightGraphqlLines`.

### Patch Changes

- Updated dependencies [acce515]
- Updated dependencies [9675829]
- Updated dependencies [acce515]
  - @enlumine/core@0.2.0
  - @enlumine/sql@0.2.0
  - @enlumine/graphql@0.2.0
  - @enlumine/terminal@0.2.0
  - @enlumine/json@0.1.1
  - @enlumine/typescript@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [c7de3c0]
- Updated dependencies [c7de3c0]
- Updated dependencies [c7de3c0]
- Updated dependencies [c7de3c0]
  - @enlumine/typescript@0.2.0
  - @enlumine/terminal@0.1.1

## 0.1.0

### Minor Changes

- 791e9cc: Introduce independent terminal highlighting packages, opt-in themes, SQL and GraphQL line rendering, and the enlumine CLI.

### Patch Changes

- Updated dependencies [791e9cc]
  - @enlumine/core@0.1.0
  - @enlumine/json@0.1.0
  - @enlumine/typescript@0.1.0
  - @enlumine/sql@0.1.0
  - @enlumine/graphql@0.1.0
  - @enlumine/terminal@0.1.0

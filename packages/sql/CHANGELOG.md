# @enlumine/sql

## 0.2.0

### Minor Changes

- acce515: Move line-by-line ANSI highlighting into `@enlumine/terminal`. `@enlumine/sql` and `@enlumine/graphql/lexical` now export `tokenizeLines`, which returns the tokens of each line, and `highlightLines(lines, { tokenizeLines, styles })` from `@enlumine/terminal` colors them. The output is unchanged.
  
  Migrate `highlightSqlLines(lines, styles)` to `highlightLines(lines, { tokenizeLines, styles })` with `tokenizeLines` from `@enlumine/sql`, and `highlightGraphqlLines` the same way with `tokenizeLines` from `@enlumine/graphql/lexical`. The `@enlumine/sql/editor`, `@enlumine/sql/themes/ansi`, `@enlumine/graphql/editor` and `@enlumine/graphql/themes/ansi` entries are removed; use `@enlumine/terminal/themes/ansi` for the styles. The `EditorTheme` type is renamed `LineTheme`, and `enlumine` re-exports `highlightLines` instead of `highlightSqlLines` and `highlightGraphqlLines`.
- 9675829: Read non-ASCII characters in unquoted identifiers as part of the identifier. `café` was cut after `caf`, and an identifier made of CJK letters produced no token at all, so `SELECT` followed by a CJK column name and table name left both names uncolored. A Unicode space such as U+3000 still ends an identifier, the names of `@name` and `:name` parameters in the default entry may contain such characters too, and a word is a keyword only when it is spelled with ASCII letters. This also fixes a dollar-quote opener after such an identifier, as in `café$tag$x`, starting a string that ran to the end of the input.
- acce515: Add `@enlumine/sql/postgresql`, which tokenizes PostgreSQL with only PostgreSQL's lexical rules, not those of other dialects. A backslash inside `'...'` is an ordinary character, `[` and `]` are brackets instead of a quoted identifier, `#` is an operator instead of a comment, and a backtick does not quote an identifier. `@`, `:` and `?` are operators instead of the start of `@name`, `:name` and `?` parameters, so `a[1:2]` is a slice and the jsonb `?` is an operator. `E'...'` strings still treat a backslash as an escape. The default entry now also tokenizes a tagged dollar-quoted string (`$tag$ ... $tag$`) as one string; the other existing behaviour is unchanged, and importing one dialect does not bundle the others.

### Patch Changes

- Updated dependencies [acce515]
  - @enlumine/core@0.2.0

## 0.1.0

### Minor Changes

- 791e9cc: Introduce independent terminal highlighting packages, opt-in themes, SQL and GraphQL line rendering, and the enlumine CLI.

### Patch Changes

- Updated dependencies [791e9cc]
  - @enlumine/core@0.1.0

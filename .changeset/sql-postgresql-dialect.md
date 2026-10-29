---
"@enlumine/sql": minor
---

Add `@enlumine/sql/postgresql`, which tokenizes PostgreSQL with only PostgreSQL's lexical rules, not those of other dialects. A backslash inside `'...'` is an ordinary character, `[` and `]` are brackets instead of a quoted identifier, `#` is an operator instead of a comment, and a backtick does not quote an identifier. `@`, `:` and `?` are operators instead of the start of `@name`, `:name` and `?` parameters, so `a[1:2]` is a slice and the jsonb `?` is an operator. `E'...'` strings still treat a backslash as an escape. The default entry now also tokenizes a tagged dollar-quoted string (`$tag$ ... $tag$`) as one string; the other existing behaviour is unchanged, and importing one dialect does not bundle the others.

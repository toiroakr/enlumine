---
"@enlumine/sql": patch
---

Add `@enlumine/sql/postgresql`, which tokenizes PostgreSQL without the quoting rules of other dialects. A backslash inside `'...'` is an ordinary character, `[` and `]` are brackets instead of a quoted identifier, `#` is an operator instead of a comment, and a backtick does not quote an identifier. `E'...'` strings still treat a backslash as an escape. The existing entries are unchanged, and importing one dialect does not bundle the others.

---
"@enlumine/sql": minor
---

Read non-ASCII characters in unquoted identifiers as part of the identifier. `café` was cut after `caf`, and an identifier made of CJK letters produced no token at all, so `SELECT` followed by a CJK column name and table name left both names uncolored. A Unicode space such as U+3000 still ends an identifier, and a word is a keyword only when it is spelled with ASCII letters. This also fixes a dollar-quote opener after such an identifier, as in `café$tag$x`, starting a string that ran to the end of the input.

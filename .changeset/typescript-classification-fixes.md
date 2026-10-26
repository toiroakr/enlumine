---
"@enlumine/typescript": minor
---

Fix several classification gaps. Token ranges are unchanged; only the kind of some tokens changes.

- Members of an interface, type literal or class that are separated by newlines instead of semicolons are recognized, so every member name is a `property` instead of only the first one.
- Class fields are `property`.
- Contextual keywords used as plain names (`type`, `from`, `of`, `as`, `get`, `set`, `async`, `static`, `readonly`, `declare`, `abstract`, `accessor`, `override`, `module`, `namespace`) are classified like any other name: as parameters, variables, function names and calls, and member names.
- The name of a function-type alias (`type Pass = (a: A) => B`) is a `type`, not a `function`.
- Names bound by a destructured parameter (`function f({ a, b }: P)`, `([c, d]) => ...`) are `parameter`.
- The operand of `typeof` in a type (`ReturnType<typeof prepare>`) is a plain name, not a `type`.
- An enum name is a `class_name` and its members are `constant`.
- Labels (`outer: for (...) { continue outer; }`) get a new `label` token kind for both the label and the name after `break` or `continue`. The terminal `dark` and `light` themes color it.
- The name in `catch (e)` and the key of an index signature (`[key: string]: V`) are `parameter`.

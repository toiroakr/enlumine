---
"@enlumine/typescript": minor
---

Classify more parameter names as `parameter`: arrow functions with a return type annotation (`(a: T): R => a`, `async <T,>(a: T): Promise<T> => a`) and function types after an annotation colon (`interface I { n: (b: string) => void }`). Token ranges are unchanged; only tokens that were `identifier` become `parameter`.

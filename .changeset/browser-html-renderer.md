---
"@enlumine/core": minor
"@enlumine/html": minor
---

Add `@enlumine/html`, which renders tokens as escaped HTML with CSS-variable themes, and give `@enlumine/core` a `browser` export condition without `node:zlib` so the JSON tokenizer bundles for the web. Packed grammars still load only in Node.js.

# @enlumine/html

## 0.1.0

### Minor Changes

- 53d7ac2: Add `@enlumine/html`, which renders tokens as escaped HTML with CSS-variable themes, and give `@enlumine/core` a `browser` export condition without `node:zlib` so the tokenizers without a packed grammar (JSON, SQL, and the GraphQL lexical entry) bundle for the web, and make `highlight` encode carriage returns so the HTML round-trips through `innerHTML`. Packed grammars still load only in Node.js.

### Patch Changes

- Updated dependencies [53d7ac2]
  - @enlumine/core@0.2.1

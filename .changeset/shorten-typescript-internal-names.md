---
"@enlumine/typescript": patch
---

Reduce the published JavaScript by replacing the bundled general-purpose reclassification engine with a TypeScript-specific implementation and shortening internal property names. The extra internal `frames` field on the returned object, which is not part of the public `PackedTokens` type, now uses shortened keys.

# @enlumine/html

HTML rendering for enlumine tokens, with CSS-variable themes. It has no Node.js dependency and works in browsers with the tokenizers that need no packed grammar (JSON and SQL). `@enlumine/graphql/lexical` also runs in browsers, but its exports are not `Tokenizer`s (`tokenizeLines` takes an array of lines and `tokenizeLexically` can return `undefined`), so wrap one in a function that returns a fallback before passing it as `tokenizer`.

```ts
import json from "@enlumine/json";
import { highlight } from "@enlumine/html";
import dark from "@enlumine/html/themes/dark";

const style = `<style>${dark}</style>`;
const code = `<pre class="enlumine" style="background:#1e1e2e;color:#d6deeb">${highlight('{"ok": true}', { tokenizer: json })}</pre>`;
```

Every token except plain text becomes `<span class="enl-<kind>">`, with `_` in the kind replaced by `-` (for example `class_name` becomes `enl-class-name`); the text is escaped. Pass `classPrefix` to change `enl-` (the bundled themes only style `enl-`, so write your own rules for another prefix), or `tokenizer: null` to only escape the source. The prefix and kind are escaped too, so the output is safe to assign to `innerHTML`. A theme is a CSS string: it sets `--enl-<kind>` colors on `.enlumine` and applies them to the matching classes. A theme sets token colors only, so give the container a matching background and base text color (`themes/dark` for a dark background, `themes/light` for a light one). Themes are separate modules (`@enlumine/html/themes/dark`, `@enlumine/html/themes/light`).

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for language limits in browsers. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

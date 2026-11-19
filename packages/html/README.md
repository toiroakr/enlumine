# @enlumine/html

HTML rendering for enlumine tokens, with CSS-variable themes. It has no Node.js dependency and works in browsers with the JSON tokenizer.

```ts
import json from "@enlumine/json";
import { highlight } from "@enlumine/html";
import dark from "@enlumine/html/themes/dark";

const style = `<style>${dark}</style>`;
const code = `<pre class="enlumine">${highlight('{"ok": true}', { tokenizer: json })}</pre>`;
```

Every token except plain text becomes `<span class="enl-<kind>">`; the text is escaped. Pass `classPrefix` to change `enl-`, or `tokenizer: null` to only escape the source. A theme is a CSS string: it sets `--enl-<kind>` colors on `.enlumine` and applies them to the matching classes. Themes are separate modules (`@enlumine/html/themes/dark`, `@enlumine/html/themes/light`).

See the [project documentation](https://github.com/toiroakr/enlumine#readme) for language limits in browsers. Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

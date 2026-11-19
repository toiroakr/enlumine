# @enlumine/react

A React component that renders enlumine tokens as elements. It builds `<span>` elements instead of an HTML string, so text from an untrusted source (command output, logs, errors) is escaped by React and no `dangerouslySetInnerHTML` is needed. It has no Node.js dependency and works in browsers with the tokenizers that need no packed grammar (JSON and SQL); see the [`@enlumine/html` README](../html/README.md) for the language limits.

Install the component with a tokenizer and the themes (`@enlumine/react` does not depend on them):

```sh
npm install @enlumine/react @enlumine/json @enlumine/html
```

```tsx
import json from "@enlumine/json";
import { Highlight } from "@enlumine/react";
import dark from "@enlumine/html/themes/dark";

const App = ({ text }: { text: string }) => (
  <>
    <style>{dark}</style>
    <Highlight source={text} tokenizer={json} style={{ background: "#1e1e2e", color: "#d6deeb" }} />
  </>
);
```

`Highlight` renders `<pre class="enlumine"><code>…</code></pre>`. Every token except plain text becomes `<span class="enl-<kind>">`, with `_` in the kind replaced by `-`, the same classes `@enlumine/html` produces. Pass `tokenizer={null}` to render the source as plain text. `classPrefix` replaces `enl-` (the bundled themes only style `enl-`). Other props of `pre`, such as `className` and `style`, are passed through; `className` is added after `enlumine`.

The component has no styles of its own. Use the CSS strings from `@enlumine/html/themes/dark` or `@enlumine/html/themes/light`, and give the container a matching background and base text color. `react` 18 or 19 is a peer dependency, and `@types/react` is an optional peer for TypeScript users. `ref` is forwarded to the `pre` element; `dangerouslySetInnerHTML` is not accepted. A carriage return in the source stays in the DOM when the component renders in the browser, but markup rendered to a string on the server carries it as a raw character, which an HTML parser then turns into a line feed; `@enlumine/html` encodes it as `&#13;` for that reason.

See the [project documentation](https://github.com/toiroakr/enlumine#readme). Third-party notices are included in `THIRD_PARTY_NOTICES.txt`.

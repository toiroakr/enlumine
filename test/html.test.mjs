import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import json from "../packages/json/dist/index.js";
import typescript from "../packages/typescript/dist/index.js";
import { highlight } from "../packages/html/dist/index.js";
import dark from "../packages/html/dist/themes/dark.js";
import light from "../packages/html/dist/themes/light.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("wraps each token in a span classed by its kind and leaves plain text bare", () => {
  assert.equal(
    highlight('{"a": [1, true]}', { tokenizer: json }),
    '<span class="enl-punctuation">{</span><span class="enl-string">&quot;a&quot;</span>' +
      '<span class="enl-punctuation">:</span> <span class="enl-punctuation">[</span>' +
      '<span class="enl-number">1</span><span class="enl-punctuation">,</span> ' +
      '<span class="enl-literal">true</span><span class="enl-punctuation">]}</span>',
  );
});

test("escapes markup characters in tokens and in plain text", () => {
  const output = highlight(`{"<b>": "x&y 'z'"} <i>`, { tokenizer: json });

  assert.doesNotMatch(output, /<b>|<i>|x&y|'z'/);
  assert.match(output, /&lt;b&gt;/);
  assert.match(output, /x&amp;y &#39;z&#39;/);
  assert.ok(output.endsWith(" &lt;i&gt;"));
});

test("renders the source unchanged once tags are stripped and entities decoded", () => {
  const source = '{"k": "a<b>&\\"c", "n": [1, -2.5e3, null, false]}\n';
  const text = highlight(source, { tokenizer: json })
    .replace(/<[^>]+>/g, "")
    .replace(/&(lt|gt|quot|#39|amp);/g, (_, name) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[name]);

  assert.equal(text, source);
});

test("escapes the whole source when no tokenizer is given", () => {
  assert.equal(highlight("a < b", { tokenizer: null }), "a &lt; b");
});

test("uses the class prefix when one is given", () => {
  assert.equal(
    highlight("1", { tokenizer: json, classPrefix: "tok-" }),
    '<span class="tok-number">1</span>',
  );
});

test("escapes the class prefix and the token kind so output stays safe in innerHTML", () => {
  const malicious = () => ({ tokens: new Uint32Array([0, 0, 1]), token_types: ['a" onclick="x'] });

  for (const output of [
    highlight("1", { tokenizer: json, classPrefix: 'x" onmouseover="alert(1)' }),
    highlight("1", { tokenizer: malicious }),
  ]) {
    assert.doesNotMatch(output, /" on\w+="/);
    assert.equal((output.match(/"/g) ?? []).length, 2);
  }
});

test("highlight and the themes use the same class name for a kind with an underscore", () => {
  const output = highlight("class A {}", { tokenizer: typescript });

  assert.match(output, /<span class="enl-class-name">A<\/span>/);
  for (const theme of [dark, light])
    assert.ok(theme.includes(".enlumine .enl-class-name{color:var(--enl-class-name)}"));
});

test("themes set a color variable for the kinds and apply it to the matching class", () => {
  for (const theme of [dark, light]) {
    assert.match(theme, /\.enlumine\s*\{[^}]*--enl-keyword:\s*#[0-9a-f]{6}/i);
    assert.match(theme, /\.enlumine \.enl-keyword\s*\{\s*color:\s*var\(--enl-keyword\)/);
  }
  assert.notEqual(dark, light);
});

test("the html renderer bundles for the browser together with core and json", async () => {
  const result = await build({
    stdin: {
      contents: `import json from "@enlumine/json";
        import { highlight } from "@enlumine/html";
        import dark from "@enlumine/html/themes/dark";
        export const html = highlight("[1]", { tokenizer: json });
        export { dark };`,
      resolveDir: `${root}packages/html`,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    tsconfigRaw: {},
    logLevel: "silent",
    alias: { "@enlumine/json": `${root}packages/json/dist/index.js` },
  });

  assert.doesNotMatch(result.outputFiles[0].text, /node:/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import json from "../packages/json/dist/index.js";
import { highlight } from "../packages/html/dist/index.js";
import { Highlight } from "../packages/react/dist/index.js";

const render = (props) => renderToStaticMarkup(createElement(Highlight, props));

test("renders each token as a span classed by its kind inside pre and code", () => {
  assert.equal(
    render({ source: '{"a": 1}', tokenizer: json }),
    '<pre class="enlumine"><code><span class="enl-punctuation">{</span><span class="enl-string">&quot;a&quot;</span>' +
      '<span class="enl-punctuation">:</span> <span class="enl-number">1</span><span class="enl-punctuation">}</span></code></pre>',
  );
});

test("renders the same tokens as @enlumine/html", () => {
  const source = '{"k": [1, true, null]}';
  const inner = render({ source, tokenizer: json }).replace(/^<pre class="enlumine"><code>|<\/code><\/pre>$/g, "");

  assert.equal(inner, highlight(source, { tokenizer: json }));
});

test("renders the whole source as text when the tokenizer is null", () => {
  assert.equal(
    render({ source: "a b", tokenizer: null }),
    '<pre class="enlumine"><code>a b</code></pre>',
  );
});

test("replaces the class prefix and maps underscores in a kind to hyphens", () => {
  const tokenizer = () => ({ token_types: ["class_name"], tokens: [0, 0, 1] });

  assert.match(render({ source: "x", tokenizer, classPrefix: "t-" }), /<span class="t-class-name">x<\/span>/);
});

test("passes className and style to pre next to the enlumine class", () => {
  const html = render({ source: "1", tokenizer: json, className: "box", style: { margin: 0 } });

  assert.match(html, /^<pre (?=[^>]*class="enlumine box")(?=[^>]*style="margin:0")[^>]*>/);
});

test("shows markup in the source and in a class prefix as text, never as elements or attributes", () => {
  const evil = '"<img src=x onerror=alert(1)>"';
  const html = render({ source: `{${evil}: <script>alert(1)</script>}`, tokenizer: json, classPrefix: 'x" onmouseover="alert(1)' });

  assert.doesNotMatch(html, /<img|<script| onmouseover="/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("hands the ref to the pre element so the caller can measure or scroll it", () => {
  const ref = { current: null };
  const element = Highlight.render({ source: "1", tokenizer: json }, ref);

  assert.equal(element.type, "pre");
  assert.equal(element.props.ref ?? element.ref, ref);
});

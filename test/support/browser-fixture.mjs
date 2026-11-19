import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));

export function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ...["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].map((name) => {
      const found = spawnSync("which", [name], { encoding: "utf8" });
      return found.status === 0 ? found.stdout.trim() : undefined;
    }),
  ];
  return candidates.find((path) => path && existsSync(path));
}

export async function runChrome(chrome, args) {
  const profile = await mkdtemp(join(tmpdir(), "enlumine-chrome-"));
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--hide-scrollbars",
          "--virtual-time-budget=4000",
          `--user-data-dir=${profile}`,
          ...args,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(`Chrome exited with ${code}: ${stderr}`)),
      );
    });
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
}

const entry = `
import json from "./packages/json/dist/index.js";
import { highlight } from "./packages/html/dist/index.js";
import dark from "./packages/html/dist/themes/dark.js";
import light from "./packages/html/dist/themes/light.js";

const source = JSON.stringify(
  {
    executionId: "01JD4Q8ZK3T6W9XH2M5N7P0RVB",
    success: true,
    functionName: "add",
    result: { sum: 3, tags: ["a", "b"], note: "1 < 2 & 3 > 2", error: null },
  },
  null,
  2,
);
const panes = [
  { name: "dark", css: dark, background: "#1e1e2e", color: "#d6deeb" },
  { name: "light", css: light, background: "#ffffff", color: "#1f2328" },
];
const sample = (frame, kind) => {
  const element = frame.contentDocument.querySelector(".enl-" + kind);
  return getComputedStyle(element).color;
};
const endings = "[1,\\r\\n2,\\r3]\\n";
const holder = document.createElement("div");
holder.innerHTML = highlight(endings, { tokenizer: json });
const report = { source, errors: window.__errors, text: "", endings: { source: endings, text: holder.textContent } };
let loaded = 0;

for (const pane of panes) {
  const frame = document.createElement("iframe");
  frame.srcdoc =
    "<!doctype html><style>" + pane.css +
    "pre{margin:0}body{margin:0;padding:16px;background:" + pane.background + ";color:" + pane.color +
    ";font:14px/1.5 ui-monospace,Menlo,monospace}</style>" +
    '<pre class="enlumine">' + highlight(source, { tokenizer: json }) + "</pre>";
  frame.onload = () => {
    report[pane.name] = {
      string: sample(frame, "string"),
      number: sample(frame, "number"),
      literal: sample(frame, "literal"),
    };
    report.text = frame.contentDocument.querySelector("pre").textContent;
    if (++loaded === panes.length) document.getElementById("report").textContent = JSON.stringify(report);
  };
  document.getElementById(pane.name).append(frame);
}
`;

export async function buildFixture(directory) {
  const bundle = await build({
    stdin: { contents: entry, resolveDir: root },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    tsconfigRaw: {},
    logLevel: "silent",
  });
  const page = join(directory, "index.html");
  await writeFile(
    page,
    `<!doctype html>
<meta charset="utf-8">
<title>enlumine in the browser</title>
<style>
  body{margin:0;padding:20px;background:#f3f4f6;font:14px system-ui,sans-serif;color:#1f2328}
  h1{margin:0 0 12px;font-size:16px}
  .row{display:flex;gap:16px}
  .row>div{flex:1}
  h2{margin:0 0 6px;font-size:12px;font-weight:600;color:#57606a}
  iframe{width:100%;height:330px;border:1px solid #d0d7de;border-radius:6px}
  pre#report{display:none}
</style>
<h1>@enlumine/html with @enlumine/json, bundled for the browser</h1>
<div class="row"><div><h2>themes/dark</h2><div id="dark"></div></div><div><h2>themes/light</h2><div id="light"></div></div></div>
<pre id="report"></pre>
<script>window.__errors=[];window.onerror=(message)=>{window.__errors.push(String(message))}</script>
<script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>
`,
  );
  return page;
}

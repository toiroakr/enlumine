import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFixture, findChrome, runChrome } from "./support/browser-fixture.mjs";

const chrome = findChrome();

test(
  "a real browser colors JSON with the bundled themes and reports no script errors",
  { skip: chrome ? false : "no Chrome found; set CHROME_BIN to run the browser test" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "enlumine-e2e-"));
    try {
      const page = await buildFixture(directory);
      const dom = await runChrome(chrome, ["--dump-dom", pathToFileURL(page).href]);
      const match = dom.match(/<pre id="report">([\s\S]*?)<\/pre>/);
      assert.ok(match, `Browser page rendered no report:\n${dom}`);
      const report = JSON.parse(
        match[1]
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&"),
      );

      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.dark, {
        string: "rgb(195, 232, 141)",
        number: "rgb(247, 140, 108)",
        literal: "rgb(255, 203, 107)",
      });
      assert.deepEqual(report.light, {
        string: "rgb(55, 117, 44)",
        number: "rgb(166, 67, 24)",
        literal: "rgb(133, 86, 0)",
      });
      assert.equal(report.text, report.source);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

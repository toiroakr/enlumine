#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { text } from "node:stream/consumers";
import type { ColorLevel } from "@enlumine/terminal";
import { resolveLanguage } from "./languages.js";

const help = `Usage: enlumine [file] [--lang js|ts|json|sql|graphql|plain] [--color auto|never|16|256|truecolor] [--theme dark|light]

Read a file, or standard input when file is omitted or '-'.
Unknown file extensions use plain text. Standard input defaults to plain text.
--color auto respects NO_COLOR, FORCE_COLOR, and terminal capabilities.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      lang: { type: "string", short: "l" },
      color: { type: "string", default: "auto" },
      theme: { type: "string", default: "dark" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write(help);
    return;
  }
  if (positionals.length > 1)
    throw new Error("Expected at most one input file");
  if (values.theme !== "dark" && values.theme !== "light")
    throw new Error(`Unknown theme: ${values.theme}`);
  let level: ColorLevel;
  switch (values.color) {
    case "never":
      level = 0;
      break;
    case "16":
      level = 1;
      break;
    case "256":
      level = 2;
      break;
    case "truecolor":
      level = 3;
      break;
    case "auto": {
      const force = process.env.FORCE_COLOR;
      if (process.env.NO_COLOR !== undefined || force === "0") level = 0;
      else if (force !== undefined)
        level = force === "3" ? 3 : force === "2" ? 2 : 1;
      else
        level = process.stdout.isTTY
          ? process.stdout.getColorDepth() >= 24
            ? 3
            : process.stdout.getColorDepth() >= 8
              ? 2
              : process.stdout.getColorDepth() >= 4
                ? 1
                : 0
          : 0;
      break;
    }
    default:
      throw new Error(`Unknown color mode: ${values.color}`);
  }
  const path = positionals[0];
  const extension = path ? extname(path).slice(1).toLowerCase() : "";
  const inferred = [
    "js",
    "mjs",
    "cjs",
    "ts",
    "mts",
    "cts",
    "json",
    "sql",
    "graphql",
    "gql",
  ].includes(extension)
    ? extension
    : "plain";
  const lang = resolveLanguage(values.lang ?? inferred);
  const source =
    !path || path === "-"
      ? await text(process.stdin)
      : await readFile(path, "utf8");
  const { highlight } = await import("@enlumine/terminal");
  const theme = !level ? {} : values.theme === "light"
    ? (await import("@enlumine/terminal/themes/light")).default
    : (await import("@enlumine/terminal/themes/dark")).default;
  const loaders = {
    javascript: () => import("@enlumine/typescript"),
    typescript: () => import("@enlumine/typescript"),
    json: () => import("@enlumine/json"),
    sql: () => import("@enlumine/sql"),
    graphql: () => import("@enlumine/graphql"),
  };
  const tokenizer = level && lang !== "plain" ? (await loaders[lang]()).default : null;
  process.stdout.write(
    highlight(source, {
      tokenizer,
      colorLevel: level,
      theme,
    }),
  );
}

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

main().catch((error: unknown) => {
  process.stderr.write(
    `enlumine: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

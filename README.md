# enlumine

Terminal syntax highlighting for Node.js 22+, with independently installable language packages and opt-in themes.

Supported languages: JSON, TypeScript, SQL, GraphQL, and plain text. JavaScript labels use the TypeScript grammar. JSX/TSX and incremental tokenization are not supported.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm smoke:packages
```

The workspace contains seven packages. Package names describe the distribution layout; npm publication is a separate step. Builds emit JavaScript and declarations into each package's `dist/` directory. Generated build metadata and local measurements stay in `.generated/`.

## Packages

| Package | Contents | Runtime dependencies |
| --- | --- | --- |
| `@enlumine/core` | State-machine execution, table loading, normalized token ranges | Node built-ins |
| `@enlumine/json` | JSON tokenizer | core |
| `@enlumine/typescript` | TypeScript tokenizer, reclassification, embedded language data | core |
| `@enlumine/sql` | SQL tokenizer and line rendering | core |
| `@enlumine/graphql` | GraphQL tokenizer, fragment contexts, lexical scanning, line rendering | core |
| `@enlumine/terminal` | ANSI rendering and separate theme modules | core |
| `enlumine` | Convenience API and CLI with all four languages | core, terminal, language packages |

Each package has its own manifest, exports, declarations, and tarball. The workspace root has `private: true` and is not an npm package.

## Highlight code

```ts
import { highlight, tokenize } from "enlumine";
import dark from "@enlumine/terminal/themes/dark";

process.stdout.write(
  highlight("SELECT name FROM users;\n", {
    lang: "sql",
    theme: dark,
    colorLevel: 3,
  }),
);

const tokens = tokenize("const answer: number = 42;", "typescript");
```

A theme is required explicitly. `colorLevel` is `0` (off), `1` (16 colors), `2` (256 colors), or `3` (truecolor, the API default). The library does not inspect process environment variables.

Custom themes map token kinds to six-digit hex colors. Unconfigured kinds use the terminal foreground. Frozen themes are cached; changes to mutable themes take effect on the next call. Built-in themes are separate modules:

- `@enlumine/terminal/themes/dark`
- `@enlumine/terminal/themes/light`
- `@enlumine/terminal/themes/ansi` (ANSI style strings for `highlightLines`, not hex colors)

Colored lines reset their foreground before LF, CRLF, lone CR, or the end of input. Unicode, tabs, and final newline status are preserved. Other terminal controls are rendered visibly; for example, ESC becomes `\x1b`.

`tokenize` returns owned, contiguous `{ kind, start, end }` ranges with UTF-16 offsets. Adjacent equal kinds are merged, and gaps become `plain`. Boolean and null categories become `literal`; templates, regexes, and string escapes become `string`. Other classifications retain their language-specific names.

## Use one language

```ts
import sql from "@enlumine/sql";
import { highlight } from "@enlumine/terminal";
import { tokenize } from "@enlumine/core";
import dark from "@enlumine/terminal/themes/dark";

highlight("SELECT name FROM users;", {
  tokenizer: sql,
  theme: dark,
  colorLevel: 3,
});

tokenize("SELECT name FROM users;", sql);
```

The terminal renderer imports no language or theme data. Pass a language tokenizer, a custom `Tokenizer`, or `null` for plain text.

Each language's default export returns owned packed triples `[typeId, start, end, ...]` in a `Uint32Array`, with a `token_types` name table. Whitespace gaps may be omitted. `core.tokenize(source, tokenizer)` normalizes these into contiguous ranges.

## Highlight lines

SQL and GraphQL tokenize a list of lines, and the terminal package colors them:

```ts
import { highlightLines } from "@enlumine/terminal";
import ansi from "@enlumine/terminal/themes/ansi";
import { tokenizeLines as sqlLines } from "@enlumine/sql";
import { tokenizeLines as graphqlLines } from "@enlumine/graphql/lexical";

highlightLines(["SELECT 1 /* comment", "end */ FROM users;"], { tokenizeLines: sqlLines, styles: ansi.sql });
highlightLines(['query { field(arg: "unfinished'], { tokenizeLines: graphqlLines, styles: ansi.graphql });
```

`tokenizeLines(lines)` takes a readonly array of complete editor lines and returns one packed token table per line, in the same `[typeId, start, end, ...]` form as a tokenizer. Every call recomputes state from the supplied buffer, so nested SQL comments, quoted strings, quoted identifiers, dollar strings, and GraphQL block strings carry across lines. Unfinished GraphQL strings and valid prefixes remain classified. GraphQL classification distinguishes fields, aliases, arguments, variables, fragment type conditions, and variable list types in their respective contexts. The tokenizers contain no color codes and need only core.

`highlightLines(lines, { tokenizeLines, styles })` returns one decorated string per input line. `styles` maps a token kind to an ANSI escape string; kinds without an entry stay uncolored. Besides the kinds of the language, SQL reports `special` for text outside any token and `bracket` for `()[]{}`, and GraphQL reports kinds such as `definition`, `parameter`, `decorator`, and `brace`. The `@enlumine/terminal/themes/ansi` entry holds ready-made `sql` and `graphql` style maps; custom readonly maps work too. `highlightLines` is also re-exported by `enlumine`.

These APIs are tolerant display helpers. They do not validate complete documents or retain state between calls. ANSI output may change when token classification improves.

## Pick one SQL dialect

`@enlumine/sql` accepts the quoting of every supported dialect at once: a backslash escapes inside `'...'`, `[name]` and `` `name` `` quote identifiers, and `#` starts a comment. A dialect entry applies only its own rules, and a bundler includes only the dialect you import.

```ts
import { highlightLines } from "@enlumine/terminal";
import ansi from "@enlumine/terminal/themes/ansi";
import { tokenizeLines } from "@enlumine/sql/postgresql";

highlightLines(["SELECT replace(path, '\\', '/'), ARRAY['a', 'b']"], { tokenizeLines, styles: ansi.sql });
```

PostgreSQL differs in four ways: a backslash inside `'...'` is an ordinary character (`E'...'` strings still use backslash escapes), `[` and `]` are brackets, `#` is an operator, and a backtick does not quote an identifier. The dialect entries export the same `default` and `tokenizeLines` as `@enlumine/sql`.

## Scan GraphQL fragments

```ts
import { tokenizeFragment } from "@enlumine/graphql";
import { tokenizeLexically, scanLexically } from "@enlumine/graphql/lexical";

const selection = tokenizeFragment("user(id: $id) { name }");
const value = tokenizeFragment('{enabled: true}', "value");
const lexical = tokenizeLexically('query { name }');
const valid = scanLexically('query { name }', (kind, start, end) => {
  console.log(kind, start, end);
});
```

Fragment contexts are `selection` (default), `fields`, `arguments`, `definitions`, and `value`. They retain original offsets without continuing string or comment state from earlier chunks.

The lexical entry has `name`, `number`, `punctuation`, `comment`, and `string` categories. `tokenizeLexically` returns `undefined` for invalid or incomplete lexical input. `scanLexically` returns a boolean and may already have visited a valid prefix when it returns `false`; discard partial output when a complete valid scan is required. Callback exceptions propagate. Neither lexical function loads the document grammar or the official GraphQL runtime.

## CLI

```sh
node packages/enlumine/dist/cli.js example.ts
node packages/enlumine/dist/cli.js query.sql --theme light --color 256
cat query.graphql | node packages/enlumine/dist/cli.js --lang graphql --color truecolor
```

The packaged executable is named `enlumine`. It reads one file or standard input (`-` or no path). JSON, TypeScript, SQL, and GraphQL extensions are detected. JavaScript extensions use the TypeScript grammar. Unknown extensions and unlabeled standard input use plain text. Explicit unsupported language names fail.

`--color auto` disables color for non-TTY output, respects `NO_COLOR` before `FORCE_COLOR`, and otherwise uses terminal color-depth detection. Explicit `--color never|16|256|truecolor` overrides automatic selection. `--theme` accepts `dark` or `light`.

## Runtime architecture

Pinned twinkleplop packages are development dependencies. Build adapters prepare TypeScript and GraphQL grammars as compressed tables. TypeScript replaces the upstream general-purpose reclassification engine with a TypeScript-specific implementation, and keeps the JavaScript, TypeScript, CSS, HTML, and JSDoc grammar data it needs for embedded regions. Scope-tracking specifications are compiled at build time, stripped of unused compiler-only fields, and pooled with grammar data; internal property names are shortened by the build.

JSON and SQL use specialized lexical scanners checked against pinned upstream grammar signatures. SQL vocabulary, operators, probes, and token IDs come from the upstream module. Its vocabulary is emitted as plain strings, so SQL and the SQL/GraphQL line tokenizers do not load `node:zlib` or decompress data during import. The TypeScript and GraphQL document entries use Node's built-in Brotli decoder.

Core contains no language data, ANSI rendering, or upstream reclassification helpers. Language packages bundle their own classification helpers to support independent installation. Distributed packages do not require twinkleplop or compile grammars at runtime. Build adapters are specific to the pinned upstream versions and must be reverified on upgrades.

## Verification

`pnpm test` builds the packages, runs unit and differential tests, and checks bundle sizes. Tests compare token ranges and name tables with the pinned npm tokenizers; for TypeScript, the only allowed differences are the classification improvements listed in `scripts/token-tables.mjs`. They cover incomplete and malformed input, Unicode, ownership of returned arrays, editor context, and configurable rendering.

`pnpm test:compatibility` runs the focused tokenizer comparisons. `pnpm test:highlight-lines` runs line-highlighting tests. Tests establish behavior for the checked inputs, not complete language correctness.

`pnpm size:check` bundles all 15 nonempty combinations of the four language tokenizers with identical esbuild options. Both minified and gzip bytes must be smaller than the pinned twinkleplop public default APIs. It also checks packed results on every prefix of four language snippets; TypeScript results may differ from upstream only by the same allowed improvements. Results are written to `.generated/size-floor/results.json`.

`pnpm size` reports the sum of published JavaScript file sizes and per-file gzip sizes. These exclude declarations, notices, and dependency packages and are distinct from application bundle sizes.

`pnpm smoke:packages` packs all seven packages, installs them into temporary consumers, and checks independent language imports, public TypeScript declarations, theme separation, and the CLI. It requires npm access to resolve the consumer's package installation.

Third-party copyright and permission notices are retained in `THIRD_PARTY_NOTICES.txt` and included in every package archive.

## References

- [twinkleplop](https://github.com/pngwn/twinkleplop): language definitions and reclassification helpers.
- [Highlights architecture](https://github.com/pierrecomputer/pierre/blob/main/packages/highlights/ARCHITECTURE.md): compact lexical execution and separation of tokens from output.

## Releases

[The release guide](docs/releasing.md) covers initial npm registration, per-package Trusted Publisher setup, and subsequent Changesets releases. GitHub Actions builds and verifies packages before publishing them with short-lived OIDC credentials.

## License

[MIT](LICENSE). Third-party notices and permission terms are retained in `THIRD_PARTY_NOTICES.txt`.

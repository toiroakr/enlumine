import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const packages = ["core", "json", "typescript", "sql", "graphql", "terminal", "enlumine"];
const sizes = [];
for (const name of packages) {
  const directory = new URL(`../packages/${name}/dist/`, import.meta.url);
  const files = (await readdir(directory, { recursive: true })).filter(name => name.endsWith(".js"));
  const buffers = await Promise.all(files.map(name => readFile(new URL(name, directory))));
  sizes.push({
    package: name === "enlumine" ? name : `@enlumine/${name}`,
    bytes: buffers.reduce((sum, data) => sum + data.length, 0),
    gzipBytes: buffers.reduce((sum, data) => sum + gzipSync(data, {level:9}).length, 0),
  });
}
console.log(JSON.stringify({method:"Sum of published minified JavaScript files; gzip9 per file; excludes declarations, notices, and dependency packages", sizes}, null, 2));

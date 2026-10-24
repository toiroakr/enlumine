import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));

export async function releasePackages() {
  const directories = ["core", "json", "typescript", "sql", "graphql", "terminal", "enlumine"];
  return Promise.all(directories.map(async directory => {
    const path = new URL(`../packages/${directory}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("package.json", path), "utf8"));
    return {directory: fileURLToPath(path), manifest};
  }));
}

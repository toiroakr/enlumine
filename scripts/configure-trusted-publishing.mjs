import assert from "node:assert/strict";
import {parseArgs} from "node:util";
import {spawnSync} from "node:child_process";
import {releasePackages} from "./release-packages.mjs";

const {values} = parseArgs({options: {
  "dry-run": {type: "boolean", default: false}, package: {type: "string", multiple: true},
}});
const packages = await releasePackages();
for (const name of values.package ?? [])
  assert.ok(packages.some(({manifest}) => manifest.name === name), `Unknown package: ${name}`);
for (const {manifest} of packages) {
  if (values.package && !values.package.includes(manifest.name)) continue;
  const args = ["--yes", "npm@11.21.1", "trust", "github", manifest.name,
    "--repo=toiroakr/enlumine", "--file=release.yml", "--env=release", "--allow-publish", "--registry=https://registry.npmjs.org/", "--yes"];
  if (values["dry-run"]) console.log(JSON.stringify(["npx", ...args]));
  else {
    const result = spawnSync("npx", args, {stdio: "inherit"});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `Trusted publisher setup failed for ${manifest.name}.`);
  }
}

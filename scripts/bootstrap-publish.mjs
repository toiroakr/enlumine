import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {parseArgs} from "node:util";
import {spawnSync} from "node:child_process";
import {releasePackages, root} from "./release-packages.mjs";

const {values} = parseArgs({options: {"dry-run": {type: "boolean", default: false}}});
const packages = await releasePackages();
const destination = resolve(root, ".generated/bootstrap-packages");
await mkdir(destination, {recursive: true});
function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, {cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit"});
  if (result.error) throw result.error;
  return result;
}
if (!values["dry-run"]) {
  const authentication = run("npm", ["whoami", "--registry=https://registry.npmjs.org/"], root, true);
  assert.equal(authentication.status, 0, "Run npm login before registering packages.");
}
const plans = [];
for (const {directory, manifest} of packages) {
  assert.equal(manifest.version, "0.0.0", "Bootstrap is only for the initial 0.0.0 registration.");
  const result = run("pnpm", ["pack", "--pack-destination", destination], directory);
  assert.equal(result.status, 0, `Packing ${manifest.name} failed.`);
  const archive = resolve(destination, `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`);
  const args = ["--yes", "npm@11.21.1", "publish", archive, "--access=public", "--tag=bootstrap", "--provenance=false"];
  plans.push({name: manifest.name, version: manifest.version, archive, command: ["npx", ...args]});
  if (values["dry-run"]) continue;
  const existing = run("npm", ["view", `${manifest.name}@${manifest.version}`, "version", "--json"], root, true);
  if (existing.status === 0) {
    assert.equal(JSON.parse(existing.stdout), manifest.version);
    console.log(`${manifest.name}@${manifest.version} already exists; skipping.`);
    continue;
  }
  let error;
  try { error = JSON.parse(existing.stdout).error; } catch {}
  assert.equal(error?.code, "E404", existing.stderr || "Cannot check registry state.");
  const published = run("npx", args);
  assert.equal(published.status, 0, `Publishing ${manifest.name} failed; rerunning will skip registered versions.`);
}
if (values["dry-run"]) console.log(JSON.stringify(plans, null, 2));

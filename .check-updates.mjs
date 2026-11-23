import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchUpdateIndex } from "./apps/desktop/dist/src/update-index.js";

const keysDir = "G:/源码/juling-harness/packaging/keys";
const table = JSON.parse(readFileSync(join(keysDir, "trusted-keys.json"), "utf8"));
const trustedKeys = Object.fromEntries(Object.entries(table.keys).map(([id, f]) => [id, readFileSync(join(keysDir, f))]));
for (const repo of ["177911-juling/juling-harness"]) {
  try {
    const index = await fetchUpdateIndex({ repo, mirrorPrefix: "", trustedKeys, lastSequence: 1, arch: "x64", channel: "stable", timeoutMs: 15000 });
    console.log(repo, "-> OK sequence", index.sequence, "app", index.app.version, "runtime", index.runtime.runtimeVersion);
  } catch (error) {
    console.log(repo, "-> FAIL:", error.message);
  }
}

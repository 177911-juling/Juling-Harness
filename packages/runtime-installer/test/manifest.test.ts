import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRuntimeInstallationManifest } from "../src/index.js";

const base = {
  runtimeVersion: "18.18.0-studio.1",
  upstreamVersion: "18.18.0",
  upstreamCommit: "b5a6b2f7e5b6606b6562e678ead83f21738f34a0",
  patchsetVersion: "studio.1",
  profile: "limited",
  capabilityHash: `sha256:${"a".repeat(64)}`,
  commandManifestHash: `sha256:${"b".repeat(64)}`,
  platform: "win32-x64",
  entrypoint: "omp.exe",
  channel: "stable",
};

test("a Runtime manifest signed before the Harness rename still parses", () => {
  const manifest = parseRuntimeInstallationManifest({ ...base, studioProtocol: { min: 1, max: 1 } });
  assert.deepEqual(manifest.harnessProtocol, { min: 1, max: 1 });
});

test("a manifest with neither protocol field is rejected", () => {
  assert.throws(() => parseRuntimeInstallationManifest(base), /harnessProtocol/u);
});

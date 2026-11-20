import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AGENT_HOME_DIR_NAME, LEGACY_AGENT_HOME_DIR_NAME, migrateLegacyAgentHome } from "../src/index.js";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function seedLegacyHome(home: string): Promise<void> {
  const agent = join(home, LEGACY_AGENT_HOME_DIR_NAME, "agent");
  await mkdir(join(agent, "sessions"), { recursive: true });
  await writeFile(join(agent, "config.yml"), "model: test\n");
  await writeFile(join(agent, "sessions", "one.jsonl"), "{}\n");
}

test("moves the legacy ~/.omp tree to ~/.juling when the canonical root is absent", async () => {
  const home = await mkdtemp(join(tmpdir(), "juling-agent-home-"));
  await seedLegacyHome(home);

  const result = await migrateLegacyAgentHome(home);

  assert.equal(result.migrated, true);
  assert.equal(result.error, undefined);
  assert.equal(result.root, join(home, AGENT_HOME_DIR_NAME));
  assert.equal(await readFile(join(result.root, "agent", "config.yml"), "utf8"), "model: test\n");
  assert.equal(await exists(join(home, LEGACY_AGENT_HOME_DIR_NAME)), false);
});

test("leaves both trees alone when the canonical root already exists", async () => {
  const home = await mkdtemp(join(tmpdir(), "juling-agent-home-"));
  await seedLegacyHome(home);
  const canonical = join(home, AGENT_HOME_DIR_NAME);
  await mkdir(canonical, { recursive: true });
  await writeFile(join(canonical, "marker"), "canonical\n");

  const result = await migrateLegacyAgentHome(home);

  assert.equal(result.migrated, false);
  assert.equal(result.root, canonical);
  assert.equal(result.legacy, join(home, LEGACY_AGENT_HOME_DIR_NAME));
  assert.equal(await readFile(join(canonical, "marker"), "utf8"), "canonical\n");
  assert.equal(await exists(join(home, LEGACY_AGENT_HOME_DIR_NAME, "agent", "config.yml")), true);
});

test("is a no-op when neither tree exists and when the legacy path is not a directory", async () => {
  const empty = await mkdtemp(join(tmpdir(), "juling-agent-home-"));
  const noop = await migrateLegacyAgentHome(empty);
  assert.equal(noop.migrated, false);
  assert.equal(noop.root, join(empty, AGENT_HOME_DIR_NAME));

  const withFile = await mkdtemp(join(tmpdir(), "juling-agent-home-"));
  await writeFile(join(withFile, LEGACY_AGENT_HOME_DIR_NAME), "not a directory\n");
  const ignored = await migrateLegacyAgentHome(withFile);
  assert.equal(ignored.migrated, false);
  assert.equal(ignored.root, join(withFile, AGENT_HOME_DIR_NAME));
  assert.equal(await readFile(join(withFile, LEGACY_AGENT_HOME_DIR_NAME), "utf8"), "not a directory\n");
});

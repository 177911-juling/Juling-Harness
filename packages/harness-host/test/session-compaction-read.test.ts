import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HarnessSessionArchiveReader } from "../src/session-archive-reader.js";

test("history reads the conversation override without resuming, ignores copied settings, and sees a later reset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "harness-compaction-read-"));
  try {
    const file = join(directory, "conversation.jsonl");
    const entry = (id: string, owner: string, input: string) => ({ type: "custom", id, parentId: null, customType: "harness.compaction-threshold", data: { sessionId: owner, input } });
    await writeFile(file, [
      { type: "session", version: 3, id: "one", cwd: directory, timestamp: "2026-11-02T00:00:00Z" },
      entry("own", "one", "150k"), entry("copied", "another-conversation", "80%"),
    ].map(row => JSON.stringify(row)).join("\n") + "\n");
    const reader = new HarnessSessionArchiveReader({ sessionsRoot: directory, archiveRoot: join(directory, "archive"), allowedCwd: directory });
    assert.deepEqual(await reader.readCompaction("one"), { sessionId: "one", threshold: { kind: "tokens", value: 150000 } });
    await appendFile(file, JSON.stringify(entry("reset", "one", "")) + "\n");
    assert.deepEqual(await reader.readCompaction("one"), { sessionId: "one", threshold: null });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

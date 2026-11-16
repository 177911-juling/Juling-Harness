import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { SessionTelemetrySnapshot } from "@juling-harness/harness-protocol";
import { SessionTelemetryStore } from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function telemetry(sessionId: string): SessionTelemetrySnapshot {
  return {
    sessionId: sessionId as SessionTelemetrySnapshot["sessionId"],
    capturedAt: "2026-11-14T10:00:00.000Z",
    tokens: { input: 1, output: 2, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 3, cost: 0 },
    context: null,
  };
}

test("remove prevents an in-flight telemetry flush from recreating the record", async () => {
  const root = await mkdtemp(join(tmpdir(), "juling-harness-telemetry-store-"));
  const { promise: revision, resolve: resolveRevision } = deferred<string>();
  try {
    const store = new SessionTelemetryStore({ rootDirectory: root, resolveRevision: () => revision });
    store.record("session-a", telemetry("session-a"));
    const flushing = store.flush();
    await store.remove("session-a");
    resolveRevision("sha256:old");
    await flushing;

    assert.equal(await store.read("session-a", "sha256:old"), undefined);
    await store.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

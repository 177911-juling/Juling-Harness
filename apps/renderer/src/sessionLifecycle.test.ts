import { describe, expect, it, vi } from "vitest";
import type { SessionId, HarnessClient, ThreadId } from "@juling-harness/client-contract";
import { ensureSelectedSessionActive } from "./sessionLifecycle";

function completedResumeClient(sessionId: SessionId) {
  const command = vi.fn(async () => ({ requestId: "resume-request" }));
  const client = {
    command,
    subscribe: () => () => {},
    getState: () => ({
      commands: {
        "resume-request": {
          requestId: "resume-request",
          name: "session.resume",
          status: "completed",
          result: { sessionId },
        },
      },
    }),
  } as unknown as HarnessClient;
  return { client, command };
}

describe("ensureSelectedSessionActive", () => {
  it("resumes a loaded historical conversation before a write action", async () => {
    const selectedSessionId = "historical-session" as SessionId;
    const selectedThreadId = "historical-thread" as ThreadId;
    const { client, command } = completedResumeClient(selectedSessionId);

    await ensureSelectedSessionActive(client, {
      activeSessionId: "other-session" as SessionId,
      selectedSessionId,
      selectedThreadId,
    });

    expect(command).toHaveBeenCalledWith("session.resume", { threadId: selectedThreadId });
  });

  it("does not resume when the viewed session is already active", async () => {
    const selectedSessionId = "active-session" as SessionId;
    const { client, command } = completedResumeClient(selectedSessionId);

    await ensureSelectedSessionActive(client, {
      activeSessionId: selectedSessionId,
      selectedSessionId,
      selectedThreadId: "active-thread" as ThreadId,
    });

    expect(command).not.toHaveBeenCalled();
  });

  it("waits for the current session snapshot when the active id is unchanged but the Runtime disconnected", async () => {
    const selectedSessionId = "active-session" as SessionId;
    let state: object = {
      connection: { runtime: { status: "disconnected" }, resyncRequired: false },
      entities: { snapshot: null },
      commands: {},
    };
    let listener: (() => void) | undefined;
    const command = vi.fn();
    const client = {
      command,
      subscribe: () => () => {},
      getState: () => state,
      onState: (next: () => void) => { listener = next; return () => { listener = undefined; }; },
    } as unknown as HarnessClient;

    let settled = false;
    const pending = ensureSelectedSessionActive(client, {
      activeSessionId: selectedSessionId,
      selectedSessionId,
      selectedThreadId: "active-thread" as ThreadId,
    }).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(command).not.toHaveBeenCalled();

    state = {
      connection: { runtime: { status: "connected" }, resyncRequired: false },
      entities: { snapshot: { sessionId: selectedSessionId } },
      commands: {},
    };
    listener?.();
    await pending;
    expect(command).not.toHaveBeenCalled();
  });
});

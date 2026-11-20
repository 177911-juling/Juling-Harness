import "./locale-en.js";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { registerRemoteIpc } from "../src/remote/ipc.js";
import { REMOTE_CHANNELS } from "../src/remote/shared.js";
import type { RemoteConnectionManager } from "../src/remote/manager.js";

function fixture() {
  type Handler = (event: { sender: typeof sender }, ...args: unknown[]) => unknown;
  const handlers = new Map<string, Handler>();
  const sender = Object.assign(new EventEmitter(), { getURL: () => "file:///renderer/index.html", isDestroyed: () => false, send: () => {} });
  const calls = { connect: 0, cancel: 0, disconnect: 0 };
  let confirm = async () => true;
  let connect = async (_id: string, _credentials: unknown, _signal: AbortSignal) => {};
  const facade = {
    closed: 0,
    unsubscribed: 0,
    close: async () => { facade.closed++; },
    subscribe: () => () => { facade.unsubscribed++; },
  };
  let openContext = async () => facade;
  const remote = { generation: 1, transport: { openContext: () => openContext() } };
  const manager = {
    list: async () => ({ profiles: [], statuses: [] }), profile: () => ({ id: "target", name: "Test" }), get: () => remote,
    connect: async (id: string, credentials: unknown, signal: AbortSignal) => { calls.connect++; await connect(id, credentials, signal); },
    cancelPending: async () => { calls.cancel++; }, disconnect: async () => { calls.disconnect++; },
    onEvent: () => () => {}, onChanged: () => () => {},
  } as unknown as RemoteConnectionManager;
  const ipc = registerRemoteIpc({ ipc: { handle: (name, handler) => handlers.set(name, handler), removeHandler: name => { handlers.delete(name); } }, manager,
    isTrusted: () => true, confirmDeployment: () => confirm(), installRuntime: async () => ({ installed: false }) });
  return { ipc, calls, handlers, sender, facade, invoke: (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({ sender }, ...args)),
    setConfirm: (value: typeof confirm) => { confirm = value; }, setConnect: (value: typeof connect) => { connect = value; },
    setOpenContext: (value: typeof openContext) => { openContext = value; } };
}

test("renderer navigation cancels a pending deployment confirmation and preserves usable IPC", async () => {
  const f = fixture();
  let release!: (confirmed: boolean) => void;
  f.setConfirm(() => new Promise(resolve => { release = resolve; }));
  const credentials = { password: "test-only" };
  const pending = f.invoke(REMOTE_CHANNELS.connect, "target", credentials);
  const rejected = assert.rejects(pending, /cancelled/i);
  await new Promise(resolve => setImmediate(resolve));
  await f.ipc.cancelPending();
  await rejected;
  assert.equal(credentials.password, ""); assert.equal(f.calls.connect, 0);
  release(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.connect, 0);
  f.setConfirm(async () => true);
  await f.invoke(REMOTE_CHANNELS.connect, "target");
  assert.equal(f.calls.connect, 1);
  assert.ok(f.handlers.has(REMOTE_CHANNELS.connect));
  f.ipc.dispose();
});

test("finishing connect does not abort the established SSH channel", async () => {
  const f = fixture();
  let signal!: AbortSignal;
  f.setConnect(async (_id, _credentials, value) => { signal = value; });
  await f.invoke(REMOTE_CHANNELS.connect, "target");
  assert.equal(signal.aborted, false);
  await f.ipc.cancelPending();
  assert.equal(signal.aborted, false);
  f.ipc.dispose();
});

test("renderer navigation aborts a running connect and a later request is independent", async () => {
  const f = fixture();
  let signal!: AbortSignal;
  f.setConnect(async (_id, _credentials, value) => {
    signal = value;
    await new Promise<void>((_resolve, reject) => value.addEventListener("abort", () => reject(new Error("Connection cancelled")), { once: true }));
  });
  const credentials = { password: "test-only" };
  const pending = f.invoke(REMOTE_CHANNELS.connect, "target", credentials);
  const rejected = assert.rejects(pending, /cancelled/i);
  await new Promise(resolve => setImmediate(resolve));
  await f.ipc.cancelPending(); await rejected;
  assert.equal(signal.aborted, true); assert.equal(credentials.password, "");
  f.setConnect(async () => {});
  await f.invoke(REMOTE_CHANNELS.connect, "target");
  assert.equal(f.calls.connect, 2);
  f.ipc.dispose();
});

test("renderer crash and window destruction release owned remote contexts", async () => {
  const f = fixture();
  const crashed = await f.invoke(REMOTE_CHANNELS.openContext, "target", { workspaceId: "workspace", sessionId: "session" });
  assert.equal(f.facade.unsubscribed, 0);
  f.sender.emit("render-process-gone");
  assert.equal(f.facade.closed, 1);
  assert.equal(f.facade.unsubscribed, 1);
  await assert.rejects(() => f.invoke(REMOTE_CHANNELS.bootstrap, "target", crashed), /needs reconnection/);

  const destroyed = await f.invoke(REMOTE_CHANNELS.openContext, "target", { workspaceId: "workspace", sessionId: "session" });
  f.sender.emit("destroyed");
  assert.equal(f.facade.closed, 2);
  assert.equal(f.facade.unsubscribed, 2);
  await assert.rejects(() => f.invoke(REMOTE_CHANNELS.bootstrap, "target", destroyed), /needs reconnection/);
  f.ipc.dispose();
});

test("non-in-place main-frame navigation releases contexts but in-place navigation preserves them", async () => {
  const f = fixture();
  await f.invoke(REMOTE_CHANNELS.openContext, "target", { workspaceId: "workspace", sessionId: "session" });
  f.sender.emit("did-start-navigation", {}, "file:///renderer/index.html", true, true);
  assert.equal(f.facade.closed, 0);
  f.sender.emit("did-start-navigation", {}, "https://example.invalid", false, true);
  assert.equal(f.facade.closed, 1);
  assert.equal(f.facade.unsubscribed, 1);
  f.ipc.dispose();
});

test("a trusted renderer cannot access or close another renderer's context", async () => {
  const f = fixture();
  const contextId = await f.invoke(REMOTE_CHANNELS.openContext, "target", { workspaceId: "workspace", sessionId: "session" });
  const other = Object.assign(new EventEmitter(), { getURL: () => "file:///renderer/index.html", isDestroyed: () => false, send: () => {} });
  await assert.rejects(
    () => Promise.resolve(f.handlers.get(REMOTE_CHANNELS.bootstrap)!({ sender: other }, "target", contextId)),
    /belongs to another renderer/,
  );
  await assert.rejects(
    () => Promise.resolve(f.handlers.get(REMOTE_CHANNELS.closeContext)!({ sender: other }, "target", contextId)),
    /belongs to another renderer/,
  );
  assert.equal(f.facade.closed, 0);
  await f.invoke(REMOTE_CHANNELS.closeContext, "target", contextId);
  assert.equal(f.facade.closed, 1);
  f.ipc.dispose();
});

test("a context opened after its owner disappeared is closed immediately", async () => {
  const f = fixture();
  let resolveOpen!: (value: typeof f.facade) => void;
  f.setOpenContext(() => new Promise(resolve => { resolveOpen = resolve; }));
  const pending = f.invoke(REMOTE_CHANNELS.openContext, "target", { workspaceId: "workspace", sessionId: "session" });
  await new Promise(resolve => setImmediate(resolve));
  f.sender.emit("render-process-gone");
  resolveOpen(f.facade);
  await assert.rejects(pending, /changed while opening/);
  assert.equal(f.facade.closed, 1);
  assert.equal(f.facade.unsubscribed, 0);
  f.ipc.dispose();
});

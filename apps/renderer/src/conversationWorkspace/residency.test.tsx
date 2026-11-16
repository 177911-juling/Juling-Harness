import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { isInaccessible } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vitest";
import type { ClientContextScope, ClientEvent, ClientTransport, EventCursor, SessionId, WorkspaceId } from "@juling-harness/client-contract";
import { HarnessClientImpl } from "@juling-harness/client";
import { contractFixtures } from "@juling-harness/testkit";
import { App } from "../App";
import { __resetAppSettingsForTests } from "../settings/appSettings";
import { STARTUP_NOTICE_ID, STARTUP_NOTICE_STORAGE_KEY } from "../settings/startupNotice";
import { ONBOARDING_STORAGE_KEY, ONBOARDING_TOUR_ID } from "../onboarding/onboardingState";
import { collectRendererResources } from "../rendererResources";

vi.setConfig({ testTimeout: 15_000 });
afterEach(async () => {
  cleanup();
  await new Promise(resolve => setTimeout(resolve, 0));
  window.dispatchEvent(new Event("pagehide"));
  window.history.replaceState({}, "", "/");
  localStorage.clear(); __resetAppSettingsForTests(null);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function fixture(beforeBootstrap?: () => Promise<void>) {
  const workspaceId = "residency-project" as WorkspaceId;
  const history = contractFixtures.queryResponses["history.list"];
  if (!history.ok) throw new Error("Expected history fixture");
  const entries = Array.from({ length: 6 }, (_, index) => ({ ...history.result.entries[0]!,
    historyId: `residency-history-${index}`, threadId: `residency-thread-${index}`, sessionId: `residency-session-${index}`, title: `Residency session ${index}` }));
  const counts = { opened: 0, closed: 0, projectsOpened: 0, projectsClosed: 0, subscriptions: 0 };
  const listeners = new Set<(event: ClientEvent) => void>();
  const globalListeners = new Set<(event: ClientEvent) => void>();
  let currentCursor = "41" as EventCursor;
  function transport(scope?: ClientContextScope): ClientTransport {
    let closed = false;
    return {
      openContext: async next => { if (next.sessionId) counts.opened++; else counts.projectsOpened++; return transport(next); },
      bootstrap: async () => {
        if (scope) await beforeBootstrap?.();
        const { snapshot: _snapshot, stateVersion: _version, ...base } = structuredClone(contractFixtures.bootstrap);
        return { ...base, cursor: currentCursor, runtime: { status: "unavailable", classification: "unavailable" },
          selected: { workspaceId, ...(scope?.sessionId ? { sessionId: scope.sessionId } : {}) },
          residents: { generatedAt: "2026-11-09T00:00:00Z", residents: [] } };
      },
      query: async request => {
        const result = structuredClone((contractFixtures.queryResponses as Record<string, unknown>)[request.queryName]) as any;
        if (request.queryName === "projects.list") result.result = { activeWorkspaceId: workspaceId, workspaces: [{ workspaceId, name: "Residency project", active: true, lastOpenedAt: "2026-11-09T00:00:00Z" }] };
        if (request.queryName === "history.list") result.result = { entries, total: entries.length };
        if (request.queryName === "session.transcript.readPage") result.result.sessionId = scope?.sessionId as SessionId;
        if (request.queryName === "session.agents.list") result.result = { sessionId: scope?.sessionId, agents: [] };
        if (request.queryName === "residents.list") result.result = { generatedAt: "2026-11-09T00:00:00Z", residents: [] };
        return result;
      },
      command: async () => { throw new Error("Residency tests do not execute commands"); },
      subscribe: (subscription, listener) => {
        if (subscription.scope === "all") {
          globalListeners.add(listener);
          return () => globalListeners.delete(listener);
        }
        if (!scope?.sessionId) return () => {};
        listeners.add(listener); counts.subscriptions++;
        return () => listeners.delete(listener);
      },
      close: async () => { if (!closed) { closed = true; if (scope?.sessionId) counts.closed++; else if (scope) counts.projectsClosed++; } },
    };
  }
  return { counts, client: new HarnessClientImpl(transport()), emit(event: ClientEvent) { currentCursor = event.cursor; for (const listener of [...globalListeners, ...listeners]) listener(event); } };
}

async function mount(input = fixture(), startupPage: "home" | "workbench" = "workbench", preview = false) {
  localStorage.setItem("omp.previewMode", preview ? "1" : "0");
  localStorage.setItem(STARTUP_NOTICE_STORAGE_KEY, STARTUP_NOTICE_ID);
  localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_TOUR_ID);
  __resetAppSettingsForTests(JSON.stringify({ language: "en", theme: "light", restoreLastSession: false, rememberLayout: false, startupPage }));
  // These APIs exist in Electron but not jsdom, as in the window integration harness.
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  render(<App client={input.client} />);
  await waitFor(() => startupPage === "home"
    ? expect(document.querySelector("#pageBody")?.getAttribute("data-route")).toBe("home")
    : preview ? expect(document.querySelector("#workbench")).not.toBeNull() : expect(row(0)).toBeDefined());
  return input;
}
function dragTitlebar() {
  const canvas = document.querySelector<HTMLElement>("[data-conversation-canvas]")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 40, 1100, 800));
  fireEvent.pointerDown(document.querySelector(".topbar")!, { button: 0, clientX: 320, clientY: 60 });
  fireEvent.pointerMove(window, { clientX: 550, clientY: 200 });
  fireEvent.pointerUp(window, { clientX: 550, clientY: 200 });
}
function row(index: number) {
  return [...document.querySelectorAll<HTMLButtonElement>("#projectList .thread")].find(button => button.textContent?.includes(`Residency session ${index}`));
}
async function select(index: number) {
  await waitFor(() => expect(row(index)).toBeDefined());
  fireEvent.click(row(index)!);
  await waitFor(() => expect(document.querySelector(".cw-main-conversation #appRoot[aria-busy=true]")).toBeNull());
  await waitFor(() => expect(row(index)?.classList.contains("active")).toBe(true));
}

function navigateTo(name: "Workbench" | "History") {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name }));
}
async function expectConversation(index: number) {
  await waitFor(() => expect(document.querySelector("#pageBody")?.getAttribute("data-route")).toBeUndefined());
  await waitFor(() => expect(row(index)?.classList.contains("active")).toBe(true));
  const transcript = screen.getByRole("log");
  expect(isInaccessible(transcript)).toBe(false);
  await waitFor(() => expect(transcript.textContent).toContain("world"));
}

it("opens the selected Home activity instead of the previously active thread", async () => {
  const input = await mount(fixture(), "home");
  navigateTo("Workbench");
  await select(0);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Home" }));
  fireEvent.click(await screen.findByRole("button", { name: /Session · Residency session 1/u }));
  await expectConversation(1);
  fireEvent.click(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("button", { name: "Home" }));
  fireEvent.click(await screen.findByRole("button", { name: /Session · Residency session 0/u }));
  await expectConversation(0);
  expect(input.counts.opened).toBe(3);
});

it("notifies only for the active document without rebuilding its Host subscription", async () => {
  const notify = vi.fn();
  vi.stubGlobal("julingHarnessChrome", { notify });
  window.history.replaceState({}, "", "/?preview=1");
  const input = await mount(fixture(), "workbench", true);
  let eventId = 0;
  const template = contractFixtures.events.find(event => event.kind === "command.receipt");
  if (template?.kind !== "command.receipt") throw new Error("Expected receipt fixture");
  const emitFailure = () => {
    eventId += 1;
    const base = structuredClone(template);
    const event = { ...base,
      cursor: `${41 + eventId}` as EventCursor,
      stateVersion: (100 + eventId) as typeof base.stateVersion,
      receipt: { requestId: base.receipt.requestId, commandName: base.receipt.commandName,
        status: "failed", error: { code: "UNAVAILABLE", message: "fixture failure" }, observedAt: base.receipt.observedAt },
    } as ClientEvent;
    act(() => input.emit(event));
  };
  emitFailure();
  expect(notify).toHaveBeenCalledTimes(1);

  const subscriptions = input.counts.subscriptions;
  dragTitlebar();
  fireEvent.click(await screen.findByRole("button", { name: "New tab" }));
  fireEvent.click(within(screen.getByRole("menu", { name: "New tab" })).getByRole("menuitem", { name: "New conversation" }));
  await waitFor(() => expect(within(screen.getByRole("tablist", { name: "Window tabs" })).getAllByRole("tab")).toHaveLength(2));
  notify.mockClear();
  emitFailure();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(input.counts.subscriptions).toBe(subscriptions);

  fireEvent.click(within(screen.getByRole("tablist", { name: "Window tabs" })).getAllByRole("tab")[0]!);
  notify.mockClear();
  emitFailure();
  expect(notify).toHaveBeenCalledTimes(1);
  expect(input.counts.subscriptions).toBe(subscriptions);
});

it.each([false, true])("honors Home on launch, then shows an explicitly opened offline archive (restored workspace=%s)", async restored => {
  if (restored) {
    await mount();
    await select(0);
    cleanup();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  await mount(fixture(), "home");
  expect(isInaccessible(document.querySelector("#pageBody")!)).toBe(false);
  navigateTo("Workbench");
  await waitFor(() => expect(row(1)).toBeDefined());
  expect(isInaccessible(row(1)!)).toBe(false);
  fireEvent.click(row(1)!);
  await expectConversation(1);
});

it.each([false, true])("opens a conversation from History instead of restoring its page route (released=%s)", async released => {
  const input = await mount();
  await select(0);
  const editor = document.querySelector<HTMLElement>(".cw-main-conversation [contenteditable=true]")!;
  editor.textContent = "draft retained across page navigation"; fireEvent.input(editor);
  navigateTo("History");
  await waitFor(() => expect(document.querySelector("#pageBody")?.getAttribute("data-route")).toBe("history"));
  const target = released ? 1 : 0;
  // The lazy History content loads after its route shell appears.
  fireEvent.click(await screen.findByRole("link", { name: new RegExp(`^Residency session ${target}`) }, { timeout: 5_000 }));
  if (released) {
    await expectConversation(1);
    await waitFor(() => expect(input.counts.closed).toBe(1));
    expect(editor.isConnected).toBe(false);
    fireEvent.click(row(0)!);
  }
  await expectConversation(0);
  expect(document.querySelector<HTMLElement>(".cw-main-conversation [contenteditable=true]")!.textContent).toBe("draft retained across page navigation");
});

it("keeps only the displayed conversation engine and closes replaced contexts while offline", async () => {
  const baseline = collectRendererResources()["engines.active"] ?? 0;
  const input = await mount();
  for (let index = 0; index < 6; index++) {
    await select(index);
    await waitFor(() => expect(input.counts.closed).toBe(index));
    expect(collectRendererResources()["engines.active"]).toBe(baseline + 1);
    await waitFor(() => expect(window.ompSessionPerf.snapshot().counters["real.hosts"]).toBe(1));
  }
  expect(input.counts.opened).toBe(6);
  expect(input.counts.projectsOpened).toBe(1);
  expect(window.ompSessionPerf.snapshot().counters["real.mountedDocuments"]).toBe(1);
  expect(window.ompSessionPerf.snapshot(true).counters["real.detachedNodes"]).toBe(0);
});

it("restores the latest draft after releasing its view, without reusing its old editor DOM", async () => {
  await mount();
  await select(0);
  const editor = document.querySelector<HTMLElement>(".cw-main-conversation [contenteditable=true]")!;
  editor.textContent = "draft"; fireEvent.input(editor);
  editor.textContent = "draft typed just before switching"; fireEvent.input(editor);
  await select(1);
  await waitFor(() => expect(editor.isConnected).toBe(false));
  await select(0);
  const restored = document.querySelector<HTMLElement>(".cw-main-conversation [contenteditable=true]")!;
  expect(restored).not.toBe(editor);
  await waitFor(() => expect(restored.textContent).toBe("draft typed just before switching"));
});

it("releases a context even when switching away before its bootstrap completes", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const input = await mount(fixture(() => pending));
  fireEvent.click(row(0)!);
  await waitFor(() => expect(input.counts.opened).toBe(1));
  await waitFor(() => expect(row(1)).toBeDefined());
  fireEvent.click(row(1)!);
  await waitFor(() => expect(input.counts.closed).toBe(1));
  finish();
  await waitFor(() => expect(document.querySelector(".cw-main-conversation #appRoot[aria-busy=true]")).toBeNull());
  await waitFor(() => expect(window.ompSessionPerf.snapshot().counters["real.hosts"]).toBe(1));
  expect(input.counts.opened).toBe(2);
});

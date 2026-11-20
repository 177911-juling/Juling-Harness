import { expect, test } from "bun:test";
import type { TabSession } from "../src/tools/browser/tab-supervisor";
import {
	acquireHarnessTabControl,
	assertBrowserTabAgentControl,
	releaseHarnessTabControl,
	harnessTabControlState,
	harnessTabIdentity,
} from "../src/harness/services/browser-tab-control";

test("takeover waits for the current action while excluding new Agent work and other windows", () => {
	const tab = { state: "alive", pending: new Map([["run", {}]]) } as TabSession;
	acquireHarnessTabControl(tab, "window-1");
	try {
		expect(harnessTabControlState(tab, "window-1")).toBe("waiting");
		expect(() => assertBrowserTabAgentControl(tab)).toThrow("human control");
		expect(() => acquireHarnessTabControl(tab, "window-2")).toThrow("Another Harness window");
		tab.pending.clear();
		expect(harnessTabControlState(tab, "window-1")).toBe("human");
		releaseHarnessTabControl(tab, "window-2");
		expect(() => assertBrowserTabAgentControl(tab)).toThrow();
	} finally {
		releaseHarnessTabControl(tab, "window-1");
	}
	expect(harnessTabControlState(tab, "window-1")).toBe("agent");
});
test("a rebuilt same-name tab has a new identity and expired control no longer blocks execution", async () => {
	const first = { name: "same", state: "alive", pending: new Map() } as TabSession;
	const rebuilt = { name: "same", state: "alive", pending: new Map() } as TabSession;
	expect(harnessTabIdentity(first)).not.toBe(harnessTabIdentity(rebuilt));
	acquireHarnessTabControl(first, "window", 5);
	expect(harnessTabControlState(rebuilt)).toBe("agent");
	await Bun.sleep(10);
	expect(harnessTabControlState(first)).toBe("agent");
});

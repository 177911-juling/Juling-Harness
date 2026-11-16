import { describe, expect, it } from "bun:test";
import { parseArgs } from "@oh-my-pi/pi-coding-agent/cli/args";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { createSessionManager } from "@oh-my-pi/pi-coding-agent/main";
import type { FileEntry, SessionHeader } from "@oh-my-pi/pi-coding-agent/session/session-entries";
import { listSessionsReadOnly } from "@oh-my-pi/pi-coding-agent/session/session-listing";
import { loadEntriesFromFile } from "@oh-my-pi/pi-coding-agent/session/session-loader";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import { migrateToCurrentVersion } from "@oh-my-pi/pi-coding-agent/session/session-migrations";
import { FileSessionStorage } from "@oh-my-pi/pi-coding-agent/session/session-storage";
import { classifyHarnessSessionOrigin } from "@oh-my-pi/pi-coding-agent/harness/session-origin";
import { TempDir } from "@oh-my-pi/pi-utils";
import { makeAssistantMessage } from "./helpers";

const HARNESS_ORIGIN = "harness-host" as const;

describe("Harness session origin compatibility", () => {
	it("seeds the initial persisted session created by harness-host", async () => {
		using tempDir = TempDir.createSync("@juling-harness-origin-startup-");
		const parsed = parseArgs(["--mode", "harness-host", "--session-dir", tempDir.path()]);
		const manager = await createSessionManager(parsed, tempDir.path(), Settings.isolated());

		expect(manager?.getHeader()?.harnessOrigin).toBe(HARNESS_ORIGIN);
	});

	it("persists optional Harness metadata without changing the upstream session version", async () => {
		using tempDir = TempDir.createSync("@juling-harness-origin-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path(), undefined, {
			harnessOrigin: HARNESS_ORIGIN,
		});
		manager.appendMessage(makeAssistantMessage());
		await manager.flush();

		const file = manager.getSessionFile();
		expect(file).toBeDefined();
		const entries = await loadEntriesFromFile(file!);
		const header = entries[0] as SessionHeader;
		expect(header.version).toBe(3);
		expect(header.harnessOrigin).toBe(HARNESS_ORIGIN);
		expect(migrateToCurrentVersion(structuredClone(entries) as FileEntry[])).toBe(false);

		const listed = await listSessionsReadOnly(tempDir.path(), new FileSessionStorage());
		expect(listed.map(session => session.id)).toContain(header.id);

		const reopened = await SessionManager.open(file!, tempDir.path(), undefined, { suppressBreadcrumb: true });
		expect(reopened.getHeader()?.harnessOrigin).toBe(HARNESS_ORIGIN);
		await reopened.setSessionName("renamed in upstream", "user");
		const rewritten = (await loadEntriesFromFile(file!))[0] as SessionHeader;
		expect(rewritten.harnessOrigin).toBe(HARNESS_ORIGIN);
	});

	it("keeps a resumed legacy CLI session unmarked while marking the next new Harness session", async () => {
		using tempDir = TempDir.createSync("@juling-harness-origin-legacy-");
		const legacy = SessionManager.create(tempDir.path(), tempDir.path());
		legacy.appendMessage(makeAssistantMessage());
		await legacy.flush();

		const reopened = await SessionManager.open(legacy.getSessionFile()!, tempDir.path(), undefined, {
			suppressBreadcrumb: true,
		});
		reopened.setNewSessionHarnessOrigin(HARNESS_ORIGIN);
		expect(reopened.getHeader()?.harnessOrigin).toBeUndefined();
		expect(classifyHarnessSessionOrigin(reopened.getHeader()!)).toBe("cli");

		await reopened.newSession();
		expect(reopened.getHeader()?.harnessOrigin).toBe(HARNESS_ORIGIN);
		expect(classifyHarnessSessionOrigin(reopened.getHeader()!)).toBe("harness");
	});

	it("marks a fork created by Harness without changing the source session", async () => {
		using tempDir = TempDir.createSync("@juling-harness-origin-fork-");
		const source = SessionManager.create(tempDir.path(), tempDir.path());
		source.appendMessage(makeAssistantMessage());
		await source.flush();

		const forked = await SessionManager.forkFrom(
			source.getSessionFile()!,
			tempDir.path(),
			tempDir.path(),
			undefined,
			{ suppressBreadcrumb: true, harnessOrigin: HARNESS_ORIGIN },
		);

		expect(source.getHeader()?.harnessOrigin).toBeUndefined();
		expect(forked.getHeader()?.harnessOrigin).toBe(HARNESS_ORIGIN);
		expect(forked.getHeader()?.parentSession).toBe(source.getSessionId());
	});

	it("treats absent or unknown metadata as CLI-compatible", () => {
		expect(classifyHarnessSessionOrigin({})).toBe("cli");
		expect(classifyHarnessSessionOrigin({ harnessOrigin: "harness-host" })).toBe("harness");
		expect(classifyHarnessSessionOrigin({ harnessOrigin: "future-origin" })).toBe("cli");
		expect(classifyHarnessSessionOrigin({ studioOrigin: "studio-host" })).toBe("harness");
	});
});

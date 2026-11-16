import { beforeEach } from "bun:test";
import { resetSettingsForTest } from "../src/config/settings";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { afterEach, describe, expect, test } from "bun:test";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { AgentPauseGate } from "@oh-my-pi/pi-agent-core";
import type { AgentSessionEvent } from "@oh-my-pi/pi-coding-agent/session/agent-session-events";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";
import {
	type DecodedHarnessFrame,
	encodeHarnessFrame,
	type HarnessEventEnvelope,
	HarnessFrameDecoder,
	type HarnessHelloResponse,
} from "@oh-my-pi/pi-coding-agent/harness/bridge-protocol";
import { HarnessBridgeServer } from "@oh-my-pi/pi-coding-agent/harness/bridge-server";
import {
	CONVERSATION_MESSAGE_DELTA_INCREMENTS_STATE_VERSION,
	type ConversationRuntimeEvent,
} from "@oh-my-pi/pi-coding-agent/harness/conversation-protocol";
import { HarnessCommandManifestService } from "@oh-my-pi/pi-coding-agent/harness/services/command-manifest-service";
import { ConversationLiveProjector } from "@oh-my-pi/pi-coding-agent/harness/services/conversation-live-projector";
import { HarnessInteractionGateway } from "@oh-my-pi/pi-coding-agent/harness/services/interaction-port";
import { HarnessLiveService } from "@oh-my-pi/pi-coding-agent/harness/services/live-service";
import { HarnessLoopService } from "@oh-my-pi/pi-coding-agent/harness/services/loop-service";
import { HarnessPauseService } from "@oh-my-pi/pi-coding-agent/harness/services/pause-service";
import { HarnessSessionTranscriptService } from "@oh-my-pi/pi-coding-agent/harness/services/session-transcript-service";
import { HarnessStateProjector } from "@oh-my-pi/pi-coding-agent/harness/state-projector";
import { createHarnessHostRuntime, type HarnessHostRuntime } from "@oh-my-pi/pi-coding-agent/harness/harness-host-mode";
import { TempDir } from "@oh-my-pi/pi-utils";

const usage = {
	input: 1,
	output: 1,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 2,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function userMessage(text: string) {
	return { role: "user" as const, content: text, timestamp: Date.now() };
}

function assistantMessage(text: string) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		api: "anthropic-messages" as const,
		provider: "anthropic" as const,
		model: "claude-sonnet-4-20250514",
		usage,
		stopReason: "stop" as const,
		timestamp: Date.now(),
	};
}

function toolResult(toolCallId: string, toolName: string, text: string) {
	return {
		role: "toolResult" as const,
		toolCallId,
		toolName,
		content: [{ type: "text" as const, text }],
		isError: false,
		timestamp: Date.now(),
	};
}

class SessionEventBus {
	readonly #listeners: Array<(event: AgentSessionEvent) => void> = [];

	subscribe(listener: (event: AgentSessionEvent) => void): () => void {
		this.#listeners.push(listener);
		return () => {
			const index = this.#listeners.indexOf(listener);
			if (index >= 0) this.#listeners.splice(index, 1);
		};
	}

	emit(event: AgentSessionEvent): void {
		for (const listener of [...this.#listeners]) listener(event);
	}

	get listenerCount(): number {
		return this.#listeners.length;
	}
}

function bindProjector(manager: SessionManager, bus: SessionEventBus, runtimeEpoch = 3) {
	const projector = new ConversationLiveProjector({
		sessionId: manager.getSessionId(),
		runtimeEpoch,
		reserveMessageId: input => manager.reserveMessageId(input.role),
		reserveCompactionId: () => manager.reserveCompactionId(),
		releaseCompactionId: id => manager.releaseCompactionId(id),
		lookupPersistedCompactionId: ({ summary }) => {
			const branch = manager.getBranch();
			for (let index = branch.length - 1; index >= 0; index--) {
				const entry = branch[index];
				if (entry.type === "compaction" && entry.summary === summary) return entry.id;
			}
			return undefined;
		},
		coalesceIntervalMs: 60_000,
	});
	projector.bind(bus);
	return projector;
}

function operatorRuntime(
	manager: SessionManager,
	conversation: ConversationLiveProjector,
	transcript = new HarnessSessionTranscriptService(() => ({
		runtimeEpoch: 3,
		sessionId: manager.getSessionId(),
		sessionManager: manager,
	})),
): HarnessHostRuntime {
	return {
		runtimeId: "runtime-live-wire",
		runtimeEpoch: 3,
		sessionId: manager.getSessionId(),
		sessionManager: manager,
		session: {
			isStreaming: false,
			isCompacting: false,
			queuedMessageCount: 0,
			getAgentId: () => "Main",
		},
		services: {
			conversation,
			transcript,
			pause: { state: () => ({ paused: false, pauseEpoch: 0 }), onChange: () => () => {} },
			loop: { state: () => undefined, onChange: () => () => {} },
			live: { state: () => ({ status: "off" }), onChange: () => () => {} },
			modes: { state: () => ({}), onChange: () => () => {} },
			commands: { manifestHash: () => "sha256:commands" },
			agents: { list: () => [], onChange: () => () => {} },
			jobs: { list: () => [] },
		},
	} as unknown as HarnessHostRuntime;
}

describe("conversation live projector Bridge wiring", () => {
	test("started messageId equals completed item.itemId and later transcript itemId", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-id-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const live = bindProjector(manager, bus);
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => envelopes.push(event));

		const user = userMessage("hello from live");
		bus.emit({ type: "agent_start" });
		bus.emit({ type: "message_start", message: user });
		const started = envelopes.find(event => event.event.kind === "conversation.message.started");
		expect(started?.event.kind).toBe("conversation.message.started");
		const messageId = started?.event.kind === "conversation.message.started" ? started.event.messageId : undefined;
		expect(messageId).toBeDefined();
		if (messageId === undefined) throw new Error("expected a projector message id");
		expect(messageId).not.toMatch(/^msg-\d+$/);

		bus.emit({ type: "message_end", message: user });
		const persistedId = manager.appendMessage(user);
		const completed = envelopes.find(event => event.event.kind === "conversation.message.completed");
		expect(completed?.event.kind).toBe("conversation.message.completed");
		expect(persistedId).toBe(messageId);
		expect(completed?.event.kind === "conversation.message.completed" && completed.event.messageId).toBe(messageId);
		expect(completed?.event.kind === "conversation.message.completed" && completed.event.item.itemId).toBe(messageId);

		const page = new HarnessSessionTranscriptService(() => ({
			runtimeEpoch: 3,
			sessionId: manager.getSessionId(),
			sessionManager: manager,
		})).read();
		expect(page.items.map(item => item.itemId)).toEqual([messageId]);

		live.dispose();
		state.dispose();
	});

	test("toolResult persist does not steal a reserved assistant message id", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-tool-id-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const reserved = manager.reserveMessageId("assistant");
		const toolId = manager.appendMessage(toolResult("call-1", "Read", "ok"));
		const assistantId = manager.appendMessage(assistantMessage("done"));
		expect(toolId).not.toBe(reserved);
		expect(assistantId).toBe(reserved);
		expect(manager.getEntry(assistantId)?.runtime).toEqual(manager.getEntry(toolId)?.runtime);
		expect(manager.getEntry(assistantId)?.runtime).toBeDefined();
	});

	test("compaction completed itemId matches persist-before-end SessionEntry and transcript itemId", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-compact-before-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const live = bindProjector(manager, bus);
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => envelopes.push(event));
		const userId = manager.appendMessage(userMessage("before compact"));

		bus.emit({ type: "auto_compaction_start", reason: "threshold", action: "context-full" });
		const persistedId = manager.appendCompaction("kept recent turns", "recent", userId, 9);
		bus.emit({
			type: "auto_compaction_end",
			action: "context-full",
			result: {
				summary: "kept recent turns",
				shortSummary: "recent",
				firstKeptEntryId: userId,
				tokensBefore: 9,
			},
			aborted: false,
			willRetry: false,
		});

		const completed = envelopes.find(event => event.event.kind === "conversation.compaction.completed");
		expect(completed?.event.kind).toBe("conversation.compaction.completed");
		expect(completed?.event.kind === "conversation.compaction.completed" && completed.event.item?.itemId).toBe(
			persistedId,
		);
		const page = new HarnessSessionTranscriptService(() => ({
			runtimeEpoch: 3,
			sessionId: manager.getSessionId(),
			sessionManager: manager,
		})).read();
		const compactItem = page.items.find(item => item.kind === "compaction");
		expect(compactItem?.itemId).toBe(persistedId);
		expect(manager.getBranch().find(entry => entry.type === "compaction")?.id).toBe(persistedId);

		live.dispose();
		state.dispose();
	});

	test("compaction completed itemId matches persist-after-end SessionEntry and transcript itemId", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-compact-after-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const live = bindProjector(manager, bus);
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => envelopes.push(event));
		const userId = manager.appendMessage(userMessage("before compact"));

		bus.emit({ type: "auto_compaction_start", reason: "threshold", action: "context-full" });
		bus.emit({
			type: "auto_compaction_end",
			action: "context-full",
			result: {
				summary: "kept recent turns",
				shortSummary: "recent",
				firstKeptEntryId: userId,
				tokensBefore: 9,
			},
			aborted: false,
			willRetry: false,
		});
		const completed = envelopes.find(event => event.event.kind === "conversation.compaction.completed");
		const liveId =
			completed?.event.kind === "conversation.compaction.completed" ? completed.event.item?.itemId : undefined;
		expect(liveId).toBeDefined();
		if (liveId === undefined) throw new Error("expected a live compaction id");
		const persistedId = manager.appendCompaction("kept recent turns", "recent", userId, 9);
		expect(persistedId).toBe(liveId);
		const page = new HarnessSessionTranscriptService(() => ({
			runtimeEpoch: 3,
			sessionId: manager.getSessionId(),
			sessionManager: manager,
		})).read();
		expect(page.items.find(item => item.kind === "compaction")?.itemId).toBe(liveId);

		live.dispose();
		state.dispose();
	});

	test("aborted compaction does not forge an item or steal later persist ids", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-compact-abort-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const live = bindProjector(manager, bus);
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => envelopes.push(event));
		const userId = manager.appendMessage(userMessage("before compact"));
		const assistantReserved = manager.reserveMessageId("assistant");

		bus.emit({ type: "auto_compaction_start", reason: "threshold", action: "context-full" });
		bus.emit({
			type: "auto_compaction_end",
			action: "context-full",
			result: {
				summary: "should not persist",
				firstKeptEntryId: userId,
				tokensBefore: 4,
			},
			aborted: true,
			willRetry: false,
		});
		const completed = envelopes.find(event => event.event.kind === "conversation.compaction.completed");
		expect(completed?.event.kind === "conversation.compaction.completed" && completed.event.item).toBeUndefined();
		expect(completed?.event.kind === "conversation.compaction.completed" && completed.event.aborted).toBe(true);

		const assistantId = manager.appendMessage(assistantMessage("still the reserved assistant"));
		expect(assistantId).toBe(assistantReserved);
		const nextCompactReserved = manager.reserveCompactionId();
		const laterCompactId = manager.appendCompaction("later compact", "later", userId, 4);
		expect(laterCompactId).toBe(nextCompactReserved);
		expect(manager.getEntry(laterCompactId)?.runtime).toEqual(manager.getEntry(userId)?.runtime);
		expect(manager.getEntry(laterCompactId)?.runtime).toBeDefined();
		expect(laterCompactId).not.toBe(assistantReserved);
		expect(
			manager.getBranch().some(entry => entry.type === "compaction" && entry.summary === "should not persist"),
		).toBe(false);

		live.dispose();
		state.dispose();
	});

	test("pure message.delta increments eventSeq but not stateVersion", () => {
		expect(CONVERSATION_MESSAGE_DELTA_INCREMENTS_STATE_VERSION).toBe(false);
		using tempDir = TempDir.createSync("@juling-harness-live-delta-sv-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const live = bindProjector(manager, bus);
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => envelopes.push(event));
		const cursorBefore = state.response("snap-before").messagesCursor;
		const versionBefore = state.stateVersion;
		const seqBefore = state.lastEventSeq;

		const assistant = assistantMessage("");
		bus.emit({ type: "agent_start" });
		bus.emit({ type: "message_start", message: assistant });
		bus.emit({
			type: "message_update",
			message: assistant,
			assistantMessageEvent: { type: "text_start", contentIndex: 0, partial: assistant },
		});
		bus.emit({
			type: "message_update",
			message: assistant,
			assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hello", partial: assistant },
		});
		live.flush();

		const started = envelopes.filter(event => event.event.kind === "conversation.message.started");
		const deltas = envelopes.filter(event => event.event.kind === "conversation.message.delta");
		expect(started).toHaveLength(1);
		expect(deltas.length).toBeGreaterThan(0);
		expect(started[0]?.stateVersion).toBe(versionBefore);
		for (const delta of deltas) {
			expect(delta.stateVersion).toBe(versionBefore);
			expect(delta.eventSeq).toBeGreaterThan(seqBefore);
		}
		expect(state.stateVersion).toBe(versionBefore);
		expect(state.lastEventSeq).toBeGreaterThan(seqBefore);
		expect(state.response("snap-live").messagesCursor).toBe(cursorBefore);

		bus.emit({ type: "message_end", message: assistantMessage("Hello") });
		const completed = envelopes.find(event => event.event.kind === "conversation.message.completed");
		expect(completed?.stateVersion).toBe(versionBefore + 1);
		expect(state.response("snap-after-complete").messagesCursor).toBe(cursorBefore);

		live.dispose();
		state.dispose();
	});

	test("rebind drops events from the previous session subscription", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-rebind-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const first = new SessionEventBus();
		const second = new SessionEventBus();
		const live = bindProjector(manager, first);
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => envelopes.push(event));

		const firstUser = userMessage("old session");
		first.emit({ type: "message_start", message: firstUser });
		expect(envelopes.some(event => event.event.kind === "conversation.message.started")).toBe(true);

		live.rebind(second, { sessionId: "session-rebound", runtimeEpoch: 3 });
		envelopes.length = 0;
		first.emit({ type: "message_start", message: userMessage("must be dropped") });
		expect(envelopes).toEqual([]);
		expect(first.listenerCount).toBe(0);

		second.emit({ type: "message_start", message: userMessage("new session") });
		expect(envelopes).toHaveLength(1);
		expect(envelopes[0]?.event.kind).toBe("conversation.message.started");
		expect(envelopes[0]?.event.kind === "conversation.message.started" && envelopes[0].event.sessionId).toBe(
			"session-rebound",
		);

		live.dispose();
		state.dispose();
	});

	test("a throwing envelope listener does not block later conversation events", () => {
		using tempDir = TempDir.createSync("@juling-harness-live-throw-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const live = bindProjector(manager, bus);
		const received: string[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, live));
		state.onEvent(event => {
			if (event.event.kind === "conversation.message.started") throw new Error("ui mapper exploded");
			received.push(event.event.kind);
		});

		const user = userMessage("keep going");
		bus.emit({ type: "message_start", message: user });
		bus.emit({ type: "message_end", message: user });
		expect(received).toContain("conversation.message.completed");

		live.dispose();
		state.dispose();
	});

	test("host-mode constructs one projector, binds the session, and dispose drops the subscription", () => {
		const bus = new SessionEventBus();
		const session = {
			sessionManager: { getSessionId: () => "session-host", getCwd: () => process.cwd() },
			settings: Settings.isolated({ "loop.mode": "prompt" }),
			isStreaming: false,
			isCompacting: false,
			hasPostPromptWork: false,
			getPlanModeState: () => undefined,
			getGoalModeState: () => undefined,
			getVibeModeState: () => undefined,
			registerSessionChangeCallback: () => () => {},
			prompt: async () => {},
			compact: async () => {},
			resetSessionContext: async () => {},
			subscribe: (listener: (event: AgentSessionEvent) => void) => bus.subscribe(listener),
			setBeforeNextUserTurn: () => {},
		};
		const runtime = createHarnessHostRuntime(session as never, { runtimeEpoch: 11 }, () => "runtime-host");
		expect(runtime.services.conversation).toBeDefined();
		expect(bus.listenerCount).toBeGreaterThan(0);
		const before = bus.listenerCount;
		runtime.services.conversation?.bind(bus);
		expect(bus.listenerCount).toBe(before);
		runtime.dispose();
		expect(bus.listenerCount).toBe(0);
	});
});

const servers: HarnessBridgeServer[] = [];
const sockets: net.Socket[] = [];

function fakeLoopService(): HarnessLoopService {
	return new HarnessLoopService({
		action: () => "prompt",
		isBlocked: () => false,
		isVibeActive: () => false,
		submitPrompt: () => {},
		compact: () => {},
		reset: () => {},
		nowMs: Date.now,
		setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
		clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
	});
}

afterEach(async () => {
	for (const socket of sockets.splice(0)) socket.destroy();
	for (const server of servers.splice(0)) {
		await Promise.race([
			server.stop(),
			Bun.sleep(2_000).then(() => {
				throw new Error("Harness Bridge teardown timed out");
			}),
		]);
	}
});

async function bridgeFixture(): Promise<{ endpoint: string; tokenFile: string; token: string }> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "juling-harness-live-bridge-"));
	const token = crypto.randomBytes(32).toString("base64url");
	const tokenFile = path.join(directory, "bridge.token");
	await fs.writeFile(tokenFile, token, { encoding: "utf8", mode: 0o600 });
	return {
		endpoint:
			process.platform === "win32"
				? `\\\\.\\pipe\\juling-harness-live-${crypto.randomUUID()}`
				: path.join(directory, "bridge.sock"),
		tokenFile,
		token,
	};
}

async function fileExists(file: string): Promise<boolean> {
	try {
		await fs.access(file);
		return true;
	} catch {
		return false;
	}
}

async function waitForTokenConsumption(tokenFile: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (!(await fileExists(tokenFile))) {
			await new Promise<void>(resolve => setImmediate(resolve));
			return;
		}
		await Bun.sleep(1);
	}
	throw new Error("Harness Bridge did not consume its token file");
}

async function connect(endpoint: string): Promise<net.Socket> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const socket = await new Promise<net.Socket | undefined>(resolve => {
			const candidate = net.createConnection(endpoint);
			candidate.once("connect", () => resolve(candidate));
			candidate.once("error", () => {
				candidate.destroy();
				resolve(undefined);
			});
		});
		if (socket !== undefined) {
			sockets.push(socket);
			return socket;
		}
		await Bun.sleep(1);
	}
	throw new Error("Harness Bridge endpoint did not start listening");
}

async function receiveFrames(socket: net.Socket, count: number): Promise<DecodedHarnessFrame[]> {
	const decoder = new HarnessFrameDecoder();
	return new Promise<DecodedHarnessFrame[]>((resolve, reject) => {
		const frames: DecodedHarnessFrame[] = [];
		const onData = (chunk: Buffer) => {
			try {
				frames.push(...decoder.push(chunk));
				if (frames.length >= count) {
					socket.off("data", onData);
					resolve(frames.slice(0, count));
				}
			} catch (error) {
				socket.off("data", onData);
				reject(error);
			}
		};
		socket.on("data", onData);
		socket.once("error", reject);
	});
}

async function receiveFrame(socket: net.Socket): Promise<DecodedHarnessFrame> {
	const frames = await receiveFrames(socket, 1);
	const frame = frames[0];
	if (frame === undefined) throw new Error("Harness Bridge did not send a frame");
	return frame;
}

async function exchangeSnapshot(socket: net.Socket, requestId: string, runtimeEpoch = 7): Promise<void> {
	const response = receiveFrame(socket);
	socket.write(
		encodeHarnessFrame(`snapshot-request:${requestId}`, runtimeEpoch, {
			type: "harness.request",
			requestId,
			runtimeEpoch,
			operation: { kind: "runtime.snapshot" },
		}),
	);
	await response;
}

describe("conversation events enter Harness Bridge", () => {
	test("authenticated socket receives conversation.* envelopes from the live projector", async () => {
		using tempDir = TempDir.createSync("@juling-harness-live-socket-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const bus = new SessionEventBus();
		const conversation = bindProjector(manager, bus, 7);
		const transcript = new HarnessSessionTranscriptService(() => ({
			runtimeEpoch: 7,
			sessionId: manager.getSessionId(),
			sessionManager: manager,
		}));
		const session = {
			isStreaming: false,
			isCompacting: false,
			queuedMessageCount: 0,
			getPlanModeState: () => undefined,
			getGoalModeState: () => undefined,
			getVibeModeState: () => undefined,
			getAgentId: () => undefined,
			subscribe: (listener: (event: AgentSessionEvent) => void) => bus.subscribe(listener),
		};
		const runtime = {
			runtimeId: "runtime-instance-live",
			runtimeEpoch: 7,
			sessionId: manager.getSessionId(),
			sessionManager: manager,
			session,
			services: {
				workbench: { views: { cancelClose: () => {} } },
				conversation,
				transcript,
				pause: new HarnessPauseService(new AgentPauseGate()),
				loop: fakeLoopService(),
				live: new HarnessLiveService(),
				modes: {
					state: () => ({}),
					onChange: () => () => {},
					dispose: () => {},
				},
				tree: {
					getTree: () => ({ leafId: null, roots: [] }),
					navigate: async () => ({}),
					cancelReanswer: () => {},
				},
				fork: { fork: async () => ({ forked: true, sessionId: manager.getSessionId() }) },
				commands: new HarnessCommandManifestService(session as never),
				agents: { list: () => [], onChange: () => () => {} },
				jobs: { list: () => [] },
				interaction: new HarnessInteractionGateway(),
				btw: { onChange: () => () => {}, settle: async () => {} },
			},
		} as unknown as HarnessHostRuntime;

		const fixture = await bridgeFixture();
		const server = new HarnessBridgeServer(fixture.endpoint, fixture.tokenFile, {
			now: () => new Date("2026-08-15T00:00:00.000Z"),
		});
		servers.push(server);
		const started = server.start(runtime);
		await waitForTokenConsumption(fixture.tokenFile);
		const socket = await connect(fixture.endpoint);
		const hello = receiveFrame(socket);
		socket.write(
			encodeHarnessFrame("hello-request", 0, {
				type: "harness.hello",
				requestId: "request-live",
				supportedProtocolVersions: [1],
				requiredProfile: "full-parity-v1",
				challenge: "challenge-live",
			}),
		);
		expect(((await hello).body as HarnessHelloResponse).runtimeInstanceId).toBe("runtime-instance-live");
		await exchangeSnapshot(socket, "snapshot-live");
		await started;

		const eventFrames = receiveFrames(socket, 2);
		const user = userMessage("bridge live");
		bus.emit({ type: "message_start", message: user });
		bus.emit({ type: "message_end", message: user });
		const frames = await eventFrames;
		const kinds = frames.map(frame => (frame.body as HarnessEventEnvelope).event.kind);
		expect(kinds).toContain("conversation.message.started");
		expect(kinds).toContain("conversation.message.completed");
		const startedEvent = frames
			.map(frame => frame.body as HarnessEventEnvelope)
			.find(event => event.event.kind === "conversation.message.started");
		const completedEvent = frames
			.map(frame => frame.body as HarnessEventEnvelope)
			.find(event => event.event.kind === "conversation.message.completed");
		const startedMessageId =
			startedEvent?.event.kind === "conversation.message.started" ? startedEvent.event.messageId : undefined;
		const completedItemId =
			completedEvent?.event.kind === "conversation.message.completed"
				? completedEvent.event.item?.itemId
				: undefined;
		expect(startedMessageId).toBeDefined();
		if (startedMessageId === undefined) throw new Error("expected a started message id");
		expect(completedItemId).toBeDefined();
		if (completedItemId === undefined) throw new Error("expected a completed item id");
		expect(startedMessageId).toBe(completedItemId);
		conversation.dispose();
	});
});

describe("StateProjector child conversation isolation", () => {
	test("child events share eventSeq but do not bump main stateVersion or emit state.changed", () => {
		using tempDir = TempDir.createSync("@juling-harness-child-state-");
		const manager = SessionManager.create(tempDir.path(), tempDir.path());
		const listeners: Array<(event: ConversationRuntimeEvent) => void> = [];
		const conversation = {
			onEvent: (listener: (event: ConversationRuntimeEvent) => void) => {
				listeners.push(listener);
				return () => undefined;
			},
			dispose: () => {},
		};
		const envelopes: HarnessEventEnvelope[] = [];
		const state = new HarnessStateProjector(operatorRuntime(manager, conversation as never));
		state.onEvent(event => envelopes.push(event));
		const beforeVersion = state.stateVersion;
		const completed = (sessionId: string) => ({
			kind: "conversation.message.completed" as const,
			sessionId,
			turnId: "turn-1",
			messageId: "msg-1",
			item: {
				kind: "message" as const,
				itemId: "msg-1",
				parentId: null,
				createdAt: "2026-08-17T00:00:00.000Z",
				role: "assistant" as const,
				content: [{ type: "text" as const, text: "ok" }],
			},
		});
		listeners[0]!(completed("child-sess"));
		expect(state.stateVersion).toBe(beforeVersion);
		expect(envelopes.some(event => event.event.kind === "conversation.message.completed")).toBe(true);
		expect(envelopes.some(event => event.event.kind === "state.changed")).toBe(false);
		expect(envelopes.some(event => event.event.kind === "session.telemetry.changed")).toBe(false);
		const childSeq = envelopes.at(-1)?.eventSeq;
		listeners[0]!(completed(manager.getSessionId()));
		expect(state.stateVersion).toBe(beforeVersion + 1);
		expect(envelopes.some(event => event.event.kind === "state.changed")).toBe(true);
		expect(envelopes.at(-1)?.eventSeq).not.toBe(childSeq);
		state.dispose();
	});
});

beforeEach(async () => {
	resetSettingsForTest();
	await Settings.init({ inMemory: true });
});

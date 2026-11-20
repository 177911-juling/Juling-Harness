import { agentPauseGate } from "@oh-my-pi/pi-agent-core";
import { logger } from "@oh-my-pi/pi-utils";
import { rpcSync } from "../../thread/rpc";
import { currentThreadId, type ThreadId } from "../../thread/identity";
import { findLocalSession, type SessionToken } from "../../thread/session-directory";
import { sessionToken } from "../../thread/services/identity";
import { AgentRegistry } from "../../registry/agent-registry";
import type { AgentSession } from "../../session/agent-session";
import {
	HarnessBrowserObservationService,
	installBrowserObservationAccess,
	type HarnessBrowserObservationAccess,
	type NativeBrowserHomeOperation,
	type NativeBrowserHomeResult,
	type NativeBrowserResult,
} from "./browser-observation-service";
import type { HarnessBrowserTab } from "../browser-observation-protocol";
import type { HarnessWebMcpCatalog, WebMcpInvokeResult } from "../webmcp-protocol";
import { getCfgApprovalHost, setCfgApprovalHost, type CfgApprovalHost } from "../../internal-urls/cfg-protocol";
import { ignoreSettle, PeerCleanups } from "../../thread/services/support";
import type { ThreadService, WorkerPeer } from "../../thread/services";
import { setDefaultToolUiFactory } from "../../tools/context";
import { createHarnessRemoteUiFactory, type HarnessUiGateway } from "../remote-extension-ui";
import { HarnessInteractionError, type HarnessInteractionGateway } from "./interaction-port";
import {
	managedBrowserFor,
	installManagedBrowserAccess,
	type HarnessManagedBrowserAccess,
} from "./managed-browser-service";
import {
	computerRunPermits,
	hasComputerScope,
	emitComputerLifecycle,
	computerUserMessageStarted,
	computerToolResultDelivered,
	installComputerScopeBridge,
	type ComputerScopeBridge,
} from "../computer-runtime-lifecycle";

export interface HarnessThreadState {
	paused: boolean;
	interaction?: HarnessUiGateway;
}
export interface HarnessThreadGlobals {
	watch(listener: (state: HarnessThreadState) => void): HarnessThreadState;
	browser(sessionId: string): HarnessManagedBrowserAccess | undefined;
	registerBrowserHome(call: BrowserHomeCall): void;
	retainBrowserHome(): () => void;
	computer: ComputerScopeBridge;
	configuration(): CfgApprovalHost | null;
}

type BrowserHomeCall = (
	session: SessionToken,
	operation: NativeBrowserHomeOperation,
) => Promise<NativeBrowserHomeResult>;
const browserHomes = new Map<ThreadId, BrowserHomeCall>();
const localBrowserObservers = new WeakMap<AgentSession, HarnessBrowserObservationService>();

/** Resolve only a native registry session and its actual home; the caller additionally proves the descendant scope. */
export function harnessBrowserObservationFor(sessionId: string): HarnessBrowserObservationAccess | undefined {
	const session = AgentRegistry.global()
		.list()
		.find(ref => ref.session?.sessionManager.getSessionId() === sessionId)?.session;
	if (!session) return;
	const token = sessionToken(session),
		home = browserHomes.get(token.home);
	if (!home || token.home === currentThreadId()) return;
	return {
		tabs: async () =>
			((await home(token, { kind: "browser.tabs.get", sessionId })) as { tabs: HarnessBrowserTab[] }).tabs,
		execute: operation => home(token, operation) as Promise<NativeBrowserResult>,
		webMcpList: operation => home(token, operation) as Promise<HarnessWebMcpCatalog>,
		webMcpInvoke: operation => home(token, operation) as Promise<WebMcpInvokeResult>,
	};
}

let interaction: HarnessUiGateway | undefined;
const listeners = new Set<(state: HarnessThreadState) => void>();
const cleanups = new PeerCleanups("harness");

function state(): HarnessThreadState {
	return { paused: agentPauseGate.paused, interaction };
}

function publish(): void {
	const snapshot = state();
	for (const listener of listeners) {
		Promise.resolve(listener(snapshot)).catch(error =>
			logger.debug("Harness worker disconnected", { error: String(error) }),
		);
	}
}

/** Bind all local and worker child dialogs to this Runtime generation, never a later rebound bridge. */
export function setHarnessThreadInteraction(gateway: HarnessInteractionGateway | undefined): void {
	const generation = gateway?.generation;
	const bound = async <T>(run: () => Promise<T>): Promise<T> => {
		if (!gateway || gateway.generation !== generation)
			throw new HarnessInteractionError("INTERACTION_STALE", "Harness dialog Runtime generation changed");
		const value = await run();
		if (gateway.generation !== generation)
			throw new HarnessInteractionError("INTERACTION_STALE", "Harness dialog Runtime generation changed");
		return value;
	};
	interaction = gateway
		? {
				generation: gateway.generation,
				select: input => bound(() => gateway.select(input)),
				ask: input => bound(() => gateway.ask(input)),
				form: input => bound(() => gateway.form(input)),
				confirm: input => bound(() => gateway.confirm(input)),
				input: input => bound(() => gateway.input(input)),
				approve: input => bound(() => gateway.approve(input)),
				editor: input => bound(() => gateway.editor(input)),
				notify: (message, level) => {
					if (gateway.generation === generation) gateway.notify(message, level);
				},
				cancelCommand: rpcSync((commandId, reason, outcome) => {
					if (gateway.generation === generation) gateway.cancelCommand(commandId, reason, outcome);
				}),
			}
		: undefined;
	setDefaultToolUiFactory(interaction ? createHarnessRemoteUiFactory(interaction) : undefined);
	publish();
}

/** Pending dialogs retain their real worker and cancel its existing interaction if that home exits. */
function workerDialogs(gateway: HarnessUiGateway, peer: WorkerPeer, active: () => boolean): HarnessUiGateway {
	const run = async <T>(commandId: string, action: () => Promise<T>): Promise<T> => {
		if (!active()) throw new HarnessInteractionError("INTERACTION_STALE", "Dialog worker home is no longer active");
		const release = peer.retain?.();
		let pending = true;
		let exited = false;
		const forget = cleanups.track(peer.threadId, () => {
			try {
				if (pending) {
					exited = true;
					gateway.cancelCommand(commandId, "Dialog worker exited");
				}
			} finally {
				release?.();
			}
		});
		try {
			const value = await action();
			if (exited || !active())
				throw new HarnessInteractionError("INTERACTION_STALE", "Dialog worker exited before its answer returned");
			return value;
		} finally {
			pending = false;
			forget();
		}
	};
	return {
		...gateway,
		cancelCommand: rpcSync((commandId, reason, outcome) => {
			if (active()) gateway.cancelCommand(commandId, reason, outcome);
		}),
		notify: (message, level) => {
			if (active()) gateway.notify(message, level);
		},
		select: input => run(input.commandId, () => gateway.select(input)),
		ask: input => run(input.commandId, () => gateway.ask(input)),
		form: input => run(input.commandId, () => gateway.form(input)),
		confirm: input => run(input.commandId, () => gateway.confirm(input)),
		input: input => run(input.commandId, () => gateway.input(input)),
		approve: input => run(input.commandId, () => gateway.approve(input)),
		editor: input => run(input.commandId, () => gateway.editor(input)),
	};
}

/** Extends the native thread bridge; workers keep native loops, jobs and cost gates. */
export const harnessThreadService: ThreadService = {
	name: "harness",
	globals(peer): HarnessThreadGlobals {
		return {
			registerBrowserHome: rpcSync(call => {
				browserHomes.set(peer.threadId, call);
				installBrowserObservationAccess(harnessBrowserObservationFor);
				cleanups.track(peer.threadId, () => {
					if (browserHomes.get(peer.threadId) === call) browserHomes.delete(peer.threadId);
				});
			}),
			retainBrowserHome: rpcSync(() => rpcSync(cleanups.track(peer.threadId, peer.retain?.() ?? (() => {})))),
			browser: rpcSync(sessionId => {
				const owner = managedBrowserFor(sessionId);
				if (!owner) return undefined;
				return {
					kind: owner.kind,
					name: rpcSync(name => owner.name(name)),
					contains: rpcSync(name => owner.contains(name)),
					pageForTarget: rpcSync(targetId => owner.pageForTarget(targetId)),
					begin: async (signal, readOnly) =>
						rpcSync(cleanups.track(peer.threadId, await owner.begin(signal, readOnly))),
					webMcpList: (id, pageId, options) => owner.webMcpList(id, pageId, options),
					webMcpInvoke: operation => owner.webMcpInvoke(operation),
				};
			}),
			computer: {
				has: rpcSync(hasComputerScope),
				permits: computerRunPermits,
				event: emitComputerLifecycle,
				consumeIntent: computerUserMessageStarted,
				deliver: computerToolResultDelivered,
			},
			configuration: rpcSync(() => {
				const host = getCfgApprovalHost();
				return host
					? {
							persistentSettings: host.persistentSettings,
							approve: (request, options) => host.approve(request, options),
							applied: rpcSync(change => host.applied(change)),
						}
					: null;
			}),
			watch: rpcSync(listener => {
				let active = true;
				let previous: HarnessUiGateway | undefined;
				let dialogs: HarnessUiGateway | undefined;
				const forWorker = (snapshot: HarnessThreadState): HarnessThreadState => {
					if (snapshot.interaction !== previous) {
						previous = snapshot.interaction;
						dialogs = previous ? workerDialogs(previous, peer, () => active) : undefined;
					}
					return { ...snapshot, interaction: dialogs };
				};
				const forward = (snapshot: HarnessThreadState) => ignoreSettle(listener(forWorker(snapshot)));
				listeners.add(forward);
				const stopPause = agentPauseGate.onChange(() => forward(state()));
				cleanups.track(peer.threadId, () => {
					active = false;
					listeners.delete(forward);
					stopPause();
				});
				return forWorker(state());
			}),
		};
	},
	boot(globals): void {
		const source = globals as HarnessThreadGlobals;
		source.registerBrowserHome(async (token, operation) => {
			if (token.home !== currentThreadId())
				throw new Error("Native browser request reached a different session home.");
			const session = findLocalSession(token.key);
			if (!session || session.sessionId !== operation.sessionId)
				throw new Error("Native browser session generation changed.");
			let observation = localBrowserObservers.get(session);
			if (!observation) {
				observation = new HarnessBrowserObservationService(
					session,
					process.env.JULING_HARNESS_MEDIA_ROOT,
					process.env.JULING_HARNESS_SOCKET_DIR,
					source.retainBrowserHome,
				);
				localBrowserObservers.set(session, observation);
			}
			return await observation.executeHome(operation);
		});
		installManagedBrowserAccess(source.browser);
		setCfgApprovalHost(source.configuration());
		installComputerScopeBridge({
			has: source.computer.has,
			permits: source.computer.permits,
			event: event => ignoreSettle(source.computer.event(event)),
			consumeIntent: (sessionId, message) => ignoreSettle(source.computer.consumeIntent(sessionId, message)),
			deliver: (sessionId, toolCallId, result) =>
				ignoreSettle(source.computer.deliver(sessionId, toolCallId, result)),
		});
		const apply = (snapshot: HarnessThreadState) => {
			if (snapshot.paused) agentPauseGate.pause();
			else agentPauseGate.resume();
			setDefaultToolUiFactory(snapshot.interaction ? createHarnessRemoteUiFactory(snapshot.interaction) : undefined);
		};
		apply(source.watch(apply));
	},
	onWorkerExit(peer): void {
		cleanups.release(peer.threadId);
	},
};

import { agentPauseGate } from "@oh-my-pi/pi-agent-core";
import { logger } from "@oh-my-pi/pi-utils";
import { rpcSync } from "../../thread/rpc";
import { getCfgApprovalHost, setCfgApprovalHost, type CfgApprovalHost } from "../../internal-urls/cfg-protocol";
import { ignoreSettle, PeerCleanups } from "../../thread/services/support";
import type { ThreadService } from "../../thread/services";
import { setDefaultToolUiFactory } from "../../tools/context";
import { createHarnessRemoteUiFactory, type HarnessUiGateway } from "../remote-extension-ui";
import type { HarnessInteractionGateway } from "./interaction-port";
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

interface HarnessThreadState {
	paused: boolean;
	interaction?: HarnessUiGateway;
}
interface HarnessThreadGlobals {
	watch(listener: (state: HarnessThreadState) => void): HarnessThreadState;
	browser(sessionId: string): HarnessManagedBrowserAccess | undefined;
	computer: ComputerScopeBridge;
	configuration(): CfgApprovalHost | null;
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

/** Bind all local and worker child dialogs to the Runtime's interaction owner. */
export function setHarnessThreadInteraction(gateway: HarnessInteractionGateway | undefined): void {
	interaction = gateway
		? {
				select: input => gateway.select(input),
				ask: input => gateway.ask(input),
				confirm: input => gateway.confirm(input),
				input: input => gateway.input(input),
				approve: input => gateway.approve(input),
				editor: input => gateway.editor(input),
				notify: (message, level) => gateway.notify(message, level),
				cancelCommand: rpcSync((commandId, reason, outcome) => gateway.cancelCommand(commandId, reason, outcome)),
			}
		: undefined;
	setDefaultToolUiFactory(interaction ? createHarnessRemoteUiFactory(interaction) : undefined);
	publish();
}

/** Extends the native thread bridge; workers keep native loops, jobs and cost gates. */
export const harnessThreadService: ThreadService = {
	name: "harness",
	globals(peer): HarnessThreadGlobals {
		return {
			browser: rpcSync(sessionId => {
				const owner = managedBrowserFor(sessionId);
				if (!owner) return undefined;
				return {
					kind: owner.kind,
					name: rpcSync(name => owner.name(name)),
					contains: rpcSync(name => owner.contains(name)),
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
				listeners.add(listener);
				const stopPause = agentPauseGate.onChange(() => ignoreSettle(listener(state())));
				cleanups.track(peer.threadId, () => {
					listeners.delete(listener);
					stopPause();
				});
				return state();
			}),
		};
	},
	boot(globals): void {
		const source = globals as HarnessThreadGlobals;
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

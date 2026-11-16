import { WORKBENCH_OPERATION_KINDS } from "./workbench-protocol";
import { UPGRADE_OPERATION_KINDS } from "./runtime-upgrade-protocol";
import * as crypto from "node:crypto";
import type { HarnessRequest } from "./bridge-protocol";

export type HarnessCommandSurface = "gui" | "tui" | "system";

/** Abort/steer/pause run against a live turn. Conversation events bump
 *  `stateVersion` continuously, so a snapshot fence races the stream. */
const LIVE_TURN_OPERATION_KINDS = new Set<string>([
	...WORKBENCH_OPERATION_KINDS,
	...UPGRADE_OPERATION_KINDS,
	"btw.ask",
	"btw.abort",
	"core.abort",
	"core.steer",
	"core.followUp",
	"queue.enqueue",
	"runtime.pause",
	"runtime.resume",
	"session.model.set",
	"session.thinking.set",
	"session.taskModel.set",
	"mode.plan.enter",
	"mode.plan.exit",
	"mode.vibe.enter",
	"mode.vibe.exit",
	"goal.create",
	"goal.drop",
	"loop.enable",
	"loop.disable",
	"session.fast.set",
	"session.prewalk.arm",
	"session.prewalk.disarm",
	"session.prewalk.restart",
	"permissions.mode.set",
	"operator.invoke",
	"agent.list",
	"agent.get",
	"agent.spawn",
	"agent.send",
	"agent.kill",
	"agent.revive",
	"agent.release",
	"agent.transcript.read",
	"agent.subscribe",
	"job.list",
	"job.get",
	"job.cancel",
	"job.subscribe",
	"browser.evaluate",
	"computer.evaluate",
	"image.read",
	"terminal.image",
	"video.metadata",
	"video.frame",
	"eval.agent.start",
	"eval.agent.status",
	"eval.agent.wait",
	"eval.agent.cancel",
	"eval.completion.start",
	"eval.completion.status",
	"eval.completion.wait",
	"eval.completion.cancel",
	"eval.workpool.status",
]);

/** Queue-compatible interrupts that must run while `core.prompt` still holds
 *  the exclusive lease (streaming, 503 backoff, auto-retry). Pause/resume stay
 *  exclusive. `operator.invoke` is user-initiated and routes to the slash
 *  handler, which owns mid-stream semantics (builtin.compact aborts the live
 *  turn first, skills steer, extension commands run immediately); a plain
 *  prompt still fails closed. The Host's interaction arbiter keeps classifying
 *  it session-exclusive, but this Runtime arbiter is authoritative for it. */
const CONCURRENT_WITH_LEASE_OPERATION_KINDS = new Set<string>([
	...WORKBENCH_OPERATION_KINDS,
	...UPGRADE_OPERATION_KINDS,
	"btw.ask",
	"btw.abort",
	"core.abort",
	"core.steer",
	"core.followUp",
	"queue.enqueue",
	"session.model.set",
	"session.thinking.set",
	"session.taskModel.set",
	"mode.plan.enter",
	"mode.plan.exit",
	"mode.vibe.enter",
	"mode.vibe.exit",
	"goal.create",
	"goal.drop",
	"loop.enable",
	"loop.disable",
	"session.fast.set",
	"session.prewalk.arm",
	"session.prewalk.disarm",
	"session.prewalk.restart",
	"permissions.mode.set",
	"operator.invoke",
	"agent.list",
	"agent.get",
	"agent.spawn",
	"agent.send",
	"agent.kill",
	"agent.revive",
	"agent.release",
	"agent.transcript.read",
	"agent.subscribe",
	"job.list",
	"job.get",
	"job.cancel",
	"job.subscribe",
	"browser.evaluate",
	"computer.evaluate",
	"image.read",
	"terminal.image",
	"video.metadata",
	"video.frame",
	"eval.agent.start",
	"eval.agent.status",
	"eval.agent.wait",
	"eval.agent.cancel",
	"eval.completion.start",
	"eval.completion.status",
	"eval.completion.wait",
	"eval.completion.cancel",
	"eval.workpool.status",
]);

/** The wire dispatcher and command lease must agree on mid-turn operations. */
export function isConcurrentHarnessOperation(kind: string): boolean {
	return CONCURRENT_WITH_LEASE_OPERATION_KINDS.has(kind);
}

const DEFERRED_SESSION_PREFERENCE_KINDS = new Set<string>([
	...WORKBENCH_OPERATION_KINDS,
	...UPGRADE_OPERATION_KINDS,
	"btw.ask",
	"btw.abort",
	"session.model.set",
	"session.thinking.set",
	"session.taskModel.set",
	"mode.plan.enter",
	"mode.plan.exit",
	"mode.vibe.enter",
	"mode.vibe.exit",
	"goal.create",
	"goal.drop",
	"loop.enable",
	"loop.disable",
	"session.fast.set",
	"session.prewalk.arm",
	"session.prewalk.disarm",
	"session.prewalk.restart",
	"permissions.mode.set",
]);

/** Operations that actively cancel an in-flight compaction rather than being
 *  deferred past it. The GUI cancel button and native Esc both let `core.abort`
 *  overtake a manual compaction (`session.abort` → `abortCompaction`, then
 *  waits for its cleanup barrier), so it must not trip the BUSY_COMPACTING gate
 *  while still staying out of the deferred-preference set. Deferred-preference
 *  kinds (upgrades, `btw.ask`, `btw.abort`) bypass the same gate at the
 *  DEFERRED check above, so membership here would be unreachable. */
const COMPACTION_CANCEL_KINDS = new Set<string>(["core.abort"]);

export class HarnessRuntimeCommandError extends Error {
	constructor(
		readonly code:
			| "RUNTIME_EPOCH_STALE"
			| "STATE_VERSION_CONFLICT"
			| "COMMAND_BLOCKED"
			| "INTERACTION_STALE"
			| "NOT_OWNER"
			| "BUSY_COMPACTING"
			| "BUSY_STREAMING",
		message: string,
	) {
		super(message);
		this.name = "HarnessRuntimeCommandError";
	}
}

export interface HarnessRuntimeArbiterState {
	runtimeEpoch: number;
	stateVersion: number;
	isStreaming: boolean;
	isCompacting: boolean;
}

export interface HarnessRuntimeControlLease {
	holder: HarnessCommandSurface;
	generation: number;
	commandId: string;
}

export interface HarnessRuntimeInteractionLease {
	interactionId: string;
	commandId: string;
	owner: "gui" | "tui";
	generation: number;
}

/** Runtime-authoritative serialization gate. Host arbitration is advisory. */
export class HarnessRuntimeCommandArbiter {
	#lease: HarnessRuntimeControlLease | undefined;
	#generation = 0;
	#interaction: HarnessRuntimeInteractionLease | undefined;
	readonly #registeredOperations: ReadonlySet<string>;

	constructor(
		private readonly state: () => HarnessRuntimeArbiterState,
		registeredOperations: readonly string[] = ["runtime.pause", "runtime.resume"],
	) {
		this.#registeredOperations = new Set(registeredOperations);
	}

	currentLease(): HarnessRuntimeControlLease | undefined {
		return this.#lease === undefined ? undefined : { ...this.#lease };
	}

	currentInteraction(): HarnessRuntimeInteractionLease | undefined {
		return this.#interaction === undefined ? undefined : { ...this.#interaction };
	}

	openInteraction(commandId: string, owner: "gui" | "tui"): HarnessRuntimeInteractionLease {
		if (this.#interaction !== undefined) {
			throw new HarnessRuntimeCommandError("COMMAND_BLOCKED", "Another interaction is active");
		}
		this.#interaction = { interactionId: crypto.randomUUID(), commandId, owner, generation: 1 };
		return { ...this.#interaction };
	}

	transferInteraction(interactionId: string, from: "gui" | "tui", to: "gui" | "tui"): HarnessRuntimeInteractionLease {
		const interaction = this.#requireInteraction(interactionId);
		if (interaction.owner !== from) {
			throw new HarnessRuntimeCommandError("NOT_OWNER", "Surface does not own the interaction");
		}
		if (from !== to) this.#interaction = { ...interaction, owner: to, generation: interaction.generation + 1 };
		return { ...(this.#interaction ?? interaction) };
	}

	completeInteraction(interactionId: string, commandId: string, owner: "gui" | "tui", generation: number): void {
		const interaction = this.#requireInteraction(interactionId);
		if (interaction.generation !== generation) {
			throw new HarnessRuntimeCommandError("INTERACTION_STALE", "Interaction generation is stale");
		}
		if (interaction.commandId !== commandId || interaction.owner !== owner) {
			throw new HarnessRuntimeCommandError("NOT_OWNER", "Caller does not own the interaction");
		}
		this.#interaction = undefined;
	}

	async run<T>(
		request: HarnessRequest,
		commandId: string,
		surface: HarnessCommandSurface,
		execute: () => Promise<T> | T,
	): Promise<T> {
		const state = this.state();
		if (request.runtimeEpoch !== state.runtimeEpoch) {
			throw new HarnessRuntimeCommandError("RUNTIME_EPOCH_STALE", "Runtime epoch is stale");
		}
		if (
			request.expectedStateVersion !== undefined &&
			request.expectedStateVersion !== state.stateVersion &&
			!LIVE_TURN_OPERATION_KINDS.has(request.operation.kind)
		) {
			throw new HarnessRuntimeCommandError("STATE_VERSION_CONFLICT", "State version does not match");
		}
		if (
			state.isCompacting &&
			!DEFERRED_SESSION_PREFERENCE_KINDS.has(request.operation.kind) &&
			!COMPACTION_CANCEL_KINDS.has(request.operation.kind)
		) {
			throw new HarnessRuntimeCommandError("BUSY_COMPACTING", "Runtime is compacting");
		}
		if (!this.#registeredOperations.has(request.operation.kind)) {
			throw new HarnessRuntimeCommandError("COMMAND_BLOCKED", "Operation is not registered with the Runtime arbiter");
		}
		if (this.#interaction !== undefined && !DEFERRED_SESSION_PREFERENCE_KINDS.has(request.operation.kind)) {
			throw new HarnessRuntimeCommandError("COMMAND_BLOCKED", "An interaction is active");
		}
		if (isConcurrentHarnessOperation(request.operation.kind)) {
			return await execute();
		}
		if (this.#lease !== undefined) {
			throw new HarnessRuntimeCommandError("COMMAND_BLOCKED", "A conflicting command is active");
		}
		this.#lease = { holder: surface, generation: ++this.#generation, commandId };
		try {
			return await execute();
		} finally {
			this.#lease = undefined;
		}
	}

	#requireInteraction(interactionId: string): HarnessRuntimeInteractionLease {
		if (this.#interaction === undefined || this.#interaction.interactionId !== interactionId) {
			throw new HarnessRuntimeCommandError("INTERACTION_STALE", "Interaction is stale");
		}
		return this.#interaction;
	}
}

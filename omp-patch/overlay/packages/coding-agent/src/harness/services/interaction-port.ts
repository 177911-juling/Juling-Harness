import type {
	HarnessInteractionRequiredEvent,
	HarnessInteractionResolvedEvent,
	HarnessOperation,
	HarnessPendingInteraction,
	HarnessRemoteInteractionRequest,
} from "../bridge-protocol";
import type { HarnessRuntimeCommandArbiter } from "../command-arbiter";
import type { CfgApproval } from "../../internal-urls/cfg-protocol";
import type { ExtensionApprovalAnswer, ExtensionApprovalGrant } from "../../extensibility/extensions/types";

/** A tool approval request; `session`/`grants` mirror the upstream approval prompt's extra choices. */
export interface HarnessApprovalInput {
	commandId: string;
	title: string;
	approvalType: string;
	details: unknown;
	session?: string;
	grants?: readonly ExtensionApprovalGrant[];
}

/**
 * Map a submitted approval value to an answer. `true` is the legacy "approve"
 * submit; only choices the request offered are honoured, anything else denies.
 */
export function approvalAnswerFromValue(
	value: unknown,
	offered: Pick<HarnessApprovalInput, "session" | "grants">,
): ExtensionApprovalAnswer {
	if (value === true || value === "once") return "once";
	if (value === "session" && offered.session !== undefined) return "session";
	if (typeof value === "object" && value !== null) {
		const { grant, always } = value as { grant?: unknown; always?: unknown };
		if (offered.grants?.some(item => item.scope === grant)) {
			return { grant: grant as ExtensionApprovalGrant["scope"], always: always === true };
		}
	}
	return "deny";
}

export interface HarnessInteractionPort {
	confirm(input: { commandId: string; title: string; message: string; destructive?: boolean }): Promise<boolean>;
	select(input: {
		commandId: string;
		title: string;
		options: Array<{ id: string; label: string; description?: string }>;
		multiple?: boolean;
	}): Promise<string | string[] | undefined>;
	input(input: {
		commandId: string;
		title: string;
		placeholder?: string;
		secret?: boolean;
	}): Promise<string | undefined>;
	editor(input: {
		commandId: string;
		title: string;
		content?: string;
		language?: string;
		promptStyle?: boolean;
	}): Promise<string | undefined>;
	/**
	 * Structured tool approval. `session` and `grants` are the extra choices
	 * offered; an answer outside them, a cancel or a denial resolves `deny`.
	 */
	approve(input: HarnessApprovalInput): Promise<ExtensionApprovalAnswer>;
	ask(input: {
		commandId: string;
		title: string;
		acceptImages?: boolean;
		questions: Array<{
			id: string;
			question: string;
			header?: string;
			options: Array<{ id: string; label: string; description?: string; preview?: string }>;
			multiple?: boolean;
			recommended?: number;
		}>;
	}): Promise<unknown>;
}

interface PendingInteraction {
	request: HarnessRemoteInteractionRequest;
	owner: "gui" | "tui";
	leaseGeneration: number;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

interface WaitingInteraction {
	input: Omit<HarnessRemoteInteractionRequest, "interactionId">;
	deferred: PromiseWithResolvers<unknown>;
}

export class HarnessInteractionError extends Error {
	constructor(
		readonly code: "INTERACTION_STALE" | "NOT_OWNER" | "INVALID_ARGUMENT",
		message: string,
	) {
		super(message);
		this.name = "HarnessInteractionError";
	}
}

/** Late-bound bridge between the Runtime-owned TUI and the active bridge dispatcher. */
export class HarnessInteractionGateway implements HarnessInteractionPort {
	#port: HarnessRemoteInteractionPort | undefined;

	constructor(readonly onNotice?: (message: string, level: "info" | "warning" | "error") => void) {}

	notify(message: string, level: "info" | "warning" | "error" = "info"): void {
		this.onNotice?.(message, level);
	}

	bind(port: HarnessRemoteInteractionPort): void {
		if (this.#port !== undefined && this.#port !== port) {
			throw new HarnessInteractionError("INTERACTION_STALE", "Another interaction bridge is already bound");
		}
		this.#port = port;
	}

	unbind(port: HarnessRemoteInteractionPort): void {
		if (this.#port === port) this.#port = undefined;
	}

	pending(): HarnessPendingInteraction | undefined {
		return this.#port?.pending();
	}

	approveConfiguration(
		input: { commandId: string; title: string; details: unknown },
		timeoutMs: number,
	): Promise<CfgApproval> {
		return this.#requirePort().approveConfiguration(input, timeoutMs);
	}

	confirm(input: { commandId: string; title: string; message: string; destructive?: boolean }): Promise<boolean> {
		return this.#requirePort().confirm(input);
	}

	select(input: {
		commandId: string;
		title: string;
		options: Array<{ id: string; label: string; description?: string }>;
		multiple?: boolean;
	}): Promise<string | string[] | undefined> {
		return this.#requirePort().select(input);
	}

	input(input: {
		commandId: string;
		title: string;
		placeholder?: string;
		secret?: boolean;
	}): Promise<string | undefined> {
		return this.#requirePort().input(input);
	}

	editor(input: {
		commandId: string;
		title: string;
		content?: string;
		language?: string;
		promptStyle?: boolean;
	}): Promise<string | undefined> {
		return this.#requirePort().editor(input);
	}

	approve(input: HarnessApprovalInput): Promise<ExtensionApprovalAnswer> {
		return this.#requirePort().approve(input);
	}

	ask(input: {
		commandId: string;
		title: string;
		acceptImages?: boolean;
		questions: Array<{
			id: string;
			question: string;
			header?: string;
			options: Array<{ id: string; label: string; description?: string; preview?: string }>;
			multiple?: boolean;
			recommended?: number;
		}>;
	}): Promise<unknown> {
		return this.#requirePort().ask(input);
	}

	cancel(reason = "Runtime interaction was cancelled", outcome: "aborted" | "expired" = "aborted"): void {
		if (this.#port === undefined) return;
		this.#port.cancel(reason, outcome);
	}

	cancelCommand(
		commandId: string,
		reason = "Runtime interaction was cancelled",
		outcome: "aborted" | "expired" = "aborted",
	): void {
		this.#port?.cancelCommand(commandId, reason, outcome);
	}

	respondFromTui(operation: Extract<HarnessOperation, { kind: "interaction.respond" }>): void {
		this.#requirePort().respond(operation, "tui");
	}

	#requirePort(): HarnessRemoteInteractionPort {
		if (this.#port === undefined) {
			throw new HarnessInteractionError("INTERACTION_STALE", "No interaction bridge is active");
		}
		return this.#port;
	}
}

/** Bridge-backed Runtime interaction port. It owns no presentation state. */
export class HarnessRemoteInteractionPort implements HarnessInteractionPort {
	#pending: PendingInteraction | undefined;
	#waiting: WaitingInteraction[] = [];

	constructor(
		private readonly arbiter: HarnessRuntimeCommandArbiter,
		private readonly onOpen: (pending: HarnessPendingInteraction, event: HarnessInteractionRequiredEvent) => void,
		private readonly onClose: (event: HarnessInteractionResolvedEvent) => void,
	) {}

	pending(): HarnessPendingInteraction | undefined {
		const pending = this.#pending;
		if (pending === undefined) return undefined;
		return {
			request: structuredClone(pending.request),
			owner: pending.owner,
			leaseGeneration: pending.leaseGeneration,
		};
	}

	async confirm(input: {
		commandId: string;
		title: string;
		message: string;
		destructive?: boolean;
	}): Promise<boolean> {
		const value = await this.#request({ kind: "confirm", ...input });
		return value === true;
	}

	async select(input: {
		commandId: string;
		title: string;
		options: Array<{ id: string; label: string; description?: string }>;
		multiple?: boolean;
	}): Promise<string | string[] | undefined> {
		const value = await this.#request({ kind: "select", ...input });
		if (value === undefined || typeof value === "string") return value;
		if (Array.isArray(value) && value.every(item => typeof item === "string")) return value;
		throw new HarnessInteractionError("INVALID_ARGUMENT", "Select interaction returned an invalid value");
	}

	async input(input: {
		commandId: string;
		title: string;
		placeholder?: string;
		secret?: boolean;
	}): Promise<string | undefined> {
		return await this.#stringRequest({ kind: "input", ...input });
	}

	async editor(input: {
		commandId: string;
		title: string;
		content?: string;
		language?: string;
		promptStyle?: boolean;
	}): Promise<string | undefined> {
		return await this.#stringRequest({ kind: "editor", ...input });
	}

	async approve(input: HarnessApprovalInput): Promise<ExtensionApprovalAnswer> {
		const value = await this.#request({ kind: "approval", ...input });
		return approvalAnswerFromValue(value, input);
	}

	async approveConfiguration(
		input: { commandId: string; title: string; details: unknown },
		timeoutMs: number,
	): Promise<CfgApproval> {
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			this.cancelCommand(input.commandId, "Configuration approval expired", "expired");
		}, timeoutMs);
		try {
			const request = { kind: "approval" as const, approvalType: "configuration", ...input };
			const value = await this.#request(request);
			return value === "once" || value === "session" ? value : "deny";
		} catch {
			return timedOut ? "timeout" : "deny";
		} finally {
			clearTimeout(timer);
		}
	}

	async ask(input: {
		commandId: string;
		title: string;
		acceptImages?: boolean;
		questions: Array<{
			id: string;
			question: string;
			header?: string;
			options: Array<{ id: string; label: string; description?: string; preview?: string }>;
			multiple?: boolean;
			recommended?: number;
		}>;
	}): Promise<unknown> {
		return await this.#request({ kind: "ask", ...input });
	}

	respond(operation: Extract<HarnessOperation, { kind: "interaction.respond" }>, owner: "gui" | "tui" = "gui"): void {
		const pending = this.#pending;
		if (pending === undefined || pending.request.interactionId !== operation.interactionId) {
			throw new HarnessInteractionError("INTERACTION_STALE", "Interaction is stale");
		}
		if (pending.request.commandId !== operation.commandId || pending.owner !== owner) {
			throw new HarnessInteractionError("NOT_OWNER", "Caller does not own the interaction");
		}
		this.arbiter.completeInteraction(operation.interactionId, operation.commandId, owner, pending.leaseGeneration);
		this.#pending = undefined;
		this.onClose({
			kind: "interaction.resolved",
			interactionId: pending.request.interactionId,
			commandId: pending.request.commandId,
			leaseGeneration: pending.leaseGeneration,
			outcome: operation.decision === "cancel" ? "cancelled" : "submitted",
		});
		pending.resolve(operation.decision === "cancel" ? undefined : operation.value);
		this.#drain();
	}

	transfer(
		interactionId: string | undefined,
		commandId: string,
		from: "gui" | "tui",
		to: "gui" | "tui",
	): HarnessPendingInteraction {
		const pending = this.#pending;
		if (
			pending === undefined ||
			pending.request.commandId !== commandId ||
			(interactionId !== undefined && pending.request.interactionId !== interactionId)
		) {
			throw new HarnessInteractionError("INTERACTION_STALE", "Interaction is stale");
		}
		const lease = this.arbiter.transferInteraction(pending.request.interactionId, from, to);
		pending.owner = lease.owner;
		pending.leaseGeneration = lease.generation;
		const full = this.pending();
		if (full === undefined) throw new Error("Interaction transfer failed");
		this.onOpen(full, {
			kind: "interaction.required",
			request: structuredClone(pending.request),
			owner: lease.owner,
			leaseGeneration: lease.generation,
		});
		return full;
	}

	cancel(reason = "Runtime interaction was cancelled", outcome: "aborted" | "expired" = "aborted"): void {
		for (const queued of this.#waiting)
			queued.deferred.reject(new HarnessInteractionError("INTERACTION_STALE", reason));
		this.#waiting = [];
		this.#cancelPending(reason, outcome);
	}

	cancelCommand(
		commandId: string,
		reason = "Runtime interaction was cancelled",
		outcome: "aborted" | "expired" = "aborted",
	): void {
		this.#waiting = this.#waiting.filter(queued => {
			if (queued.input.commandId !== commandId) return true;
			queued.deferred.reject(new HarnessInteractionError("INTERACTION_STALE", reason));
			return false;
		});
		if (this.#pending?.request.commandId === commandId) this.#cancelPending(reason, outcome);
		this.#drain();
	}

	#cancelPending(reason: string, outcome: "aborted" | "expired"): void {
		const pending = this.#pending;
		if (pending === undefined) return;
		this.arbiter.completeInteraction(
			pending.request.interactionId,
			pending.request.commandId,
			pending.owner,
			pending.leaseGeneration,
		);
		this.#pending = undefined;
		this.onClose({
			kind: "interaction.resolved",
			interactionId: pending.request.interactionId,
			commandId: pending.request.commandId,
			leaseGeneration: pending.leaseGeneration,
			outcome,
		});
		pending.reject(new HarnessInteractionError("INTERACTION_STALE", reason));
	}

	async #stringRequest(
		input:
			| { kind: "input"; commandId: string; title: string; placeholder?: string; secret?: boolean }
			| {
					kind: "editor";
					commandId: string;
					title: string;
					content?: string;
					language?: string;
					promptStyle?: boolean;
			  },
	): Promise<string | undefined> {
		const value = await this.#request(input);
		if (value === undefined || typeof value === "string") return value;
		throw new HarnessInteractionError("INVALID_ARGUMENT", `${input.kind} interaction returned an invalid value`);
	}

	#request(input: Omit<HarnessRemoteInteractionRequest, "interactionId">): Promise<unknown> {
		const deferred = Promise.withResolvers<unknown>();
		this.#waiting.push({ input, deferred });
		this.#drain();
		return deferred.promise;
	}

	#drain(): void {
		if (this.#pending) return;
		const queued = this.#waiting.shift();
		if (!queued) return;
		try {
			this.#open(queued.input).then(queued.deferred.resolve, queued.deferred.reject);
		} catch (error) {
			queued.deferred.reject(error);
			this.#drain();
		}
	}

	#open(input: Omit<HarnessRemoteInteractionRequest, "interactionId">): Promise<unknown> {
		const lease = this.arbiter.openInteraction(input.commandId, "gui");
		const request = { ...input, interactionId: lease.interactionId } as HarnessRemoteInteractionRequest;
		const deferred = Promise.withResolvers<unknown>();
		this.#pending = {
			request,
			owner: lease.owner,
			leaseGeneration: lease.generation,
			resolve: deferred.resolve,
			reject: deferred.reject,
		};
		const full = this.pending();
		if (full === undefined) throw new Error("Interaction registration failed");
		try {
			this.onOpen(full, {
				kind: "interaction.required",
				request: structuredClone(request),
				owner: lease.owner,
				leaseGeneration: lease.generation,
			});
		} catch (error) {
			this.#cancelPending("Interaction publication failed", "aborted");
			this.#drain();
		}
		return deferred.promise;
	}
}

/** Deterministic interaction port for service-level tests. */
export class HarnessScriptedInteractionPort implements HarnessInteractionPort {
	constructor(private readonly responses: unknown[]) {}

	confirm(_input: { commandId: string; title: string; message: string; destructive?: boolean }): Promise<boolean> {
		return Promise.resolve(this.responses.shift() === true);
	}
	select(_input: {
		commandId: string;
		title: string;
		options: Array<{ id: string; label: string; description?: string }>;
		multiple?: boolean;
	}): Promise<string | string[] | undefined> {
		return Promise.resolve(this.responses.shift() as string | string[] | undefined);
	}
	input(_input: {
		commandId: string;
		title: string;
		placeholder?: string;
		secret?: boolean;
	}): Promise<string | undefined> {
		return Promise.resolve(this.responses.shift() as string | undefined);
	}
	editor(_input: {
		commandId: string;
		title: string;
		content?: string;
		language?: string;
		promptStyle?: boolean;
	}): Promise<string | undefined> {
		return Promise.resolve(this.responses.shift() as string | undefined);
	}
	approve(input: HarnessApprovalInput): Promise<ExtensionApprovalAnswer> {
		return Promise.resolve(approvalAnswerFromValue(this.responses.shift(), input));
	}
	ask(_input: {
		commandId: string;
		title: string;
		acceptImages?: boolean;
		questions: Array<{
			id: string;
			question: string;
			header?: string;
			options: Array<{ id: string; label: string; description?: string; preview?: string }>;
			multiple?: boolean;
			recommended?: number;
		}>;
	}): Promise<unknown> {
		return Promise.resolve(this.responses.shift());
	}
}

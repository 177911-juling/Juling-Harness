import { RUNTIME_VIEW_KINDS, isRuntimeViewKind, type RuntimeViewOperation } from "./runtime-views-protocol";
import type { SessionOwnerOperation } from "./session-owner-protocol";
import { COMPUTER_WORKSPACE_QUERY_KINDS } from "./computer-workspace-protocol";
import { CONTEXT_VIEW_KINDS, isContextViewKind, type ContextViewOperation } from "./context-view-protocol";
import type { ImageContent } from "@oh-my-pi/pi-ai";
import {
	isWorkbenchOperationKind,
	validateWorkbenchOperation,
	WORKBENCH_OPERATION_KINDS,
	type WorkbenchOperation,
} from "./workbench-protocol";
import {
	isUpgradeOperationKind,
	validateUpgradeOperation,
	UPGRADE_OPERATION_KINDS,
	type UpgradeOperation,
} from "./runtime-upgrade-protocol";
import * as crypto from "node:crypto";
import {
	CONVERSATION_LIMITS,
	type ConversationRuntimeEvent,
	SESSION_TRANSCRIPT_READ_KIND,
} from "./conversation-protocol";
import type { HarnessBtwSnapshot } from "./services/btw-service";
import type { HarnessModelState } from "./services/model-control-service";
import {
	isHarnessRuntimeSettingKey,
	isHarnessRuntimeSettingValue,
	HARNESS_RUNTIME_SETTING_KEYS,
	type HarnessRuntimeSettingKey,
	type HarnessRuntimeSettingsActivation,
} from "./services/runtime-settings-service";

export * from "./conversation-protocol";

export const HARNESS_PROTOCOL_NAME = "juling-harness" as const;
export const HARNESS_PROTOCOL_VERSION = 1 as const;
export const DEFAULT_MAX_CONTROL_FRAME_BYTES = 1024 * 1024;
const LENGTH_PREFIX_BYTES = 4;

export interface HarnessRetryState {
	attempt: number;
	maxAttempts: number;
	nextRetryAt: number;
	reason: "usage-limit" | "retry";
}

export interface HarnessHelloRequest {
	type: "harness.hello";
	requestId: string;
	supportedProtocolVersions: number[];
	requiredProfile: "full-parity-v1";
	challenge: string;
}

export interface HarnessHelloResponse {
	type: "harness.hello.result";
	requestId: string;
	selectedProtocolVersion: number;
	runtimeVersion: string;
	upstreamVersion: string;
	upstreamCommit: string;
	runtimeInstanceId: string;
	runtimeEpoch: number;
	capabilityManifest: {
		profile: "full-parity-v1" | "limited";
		generatedAt: string;
		hash: string;
		capabilities: Array<{
			id: string;
			grade: "stable" | "experimental" | "limited" | "unavailable";
			version: number;
			evidence: string;
			limitations?: string[];
		}>;
	};
	commandManifestHash: string;
	stateVersion: number;
	challengeProof: string;
}

import type { EvaluationOperation } from "./evaluation-protocol";
import { isEvaluationOperationKind, validateEvaluationOperation } from "./evaluation-validation";

export type HarnessOperation =
	| SessionOwnerOperation
	| ContextViewOperation
	| RuntimeViewOperation
	| PredictionOperation
	| WorkbenchOperation
	| UpgradeOperation
	| EvaluationOperation
	| { kind: "runtime.snapshot"; timeTravelCapture?: boolean }
	| { kind: "runtime.settings.get"; keys?: HarnessRuntimeSettingKey[]; checkHindsight?: boolean }
	| { kind: "runtime.settings.set"; key: HarnessRuntimeSettingKey; value: unknown; persist: boolean }
	| { kind: "runtime.pause" }
	| { kind: "runtime.resume"; expectedPauseEpoch: number }
	| { kind: "runtime.shutdown"; drain: true }
	| { kind: "live.start"; deviceId?: string }
	| { kind: "live.stop" }
	| { kind: "queue.enqueue"; text: string }
	| { kind: "session.clearContext" }
	| { kind: "session.drop" }
	| { kind: "session.fork" }
	| { kind: "session.handoff"; customInstructions?: string }
	| { kind: "session.fast.set"; enabled: boolean }
	| { kind: "session.prewalk.arm"; target?: string }
	| { kind: "session.prewalk.disarm" }
	| { kind: "session.prewalk.restart" }
	| { kind: "session.model.set"; selector: string; thinking?: string }
	| { kind: "session.thinking.set"; level: string }
	| { kind: "session.taskModel.set"; selector: string | null }
	| { kind: "session.tree.get" }
	| {
			kind: "session.transcript.read";
			cursor?: string;
			limit?: number;
	  }
	| {
			kind: "session.tree.navigate";
			targetId: string;
			summarize?: boolean;
			customInstructions?: string;
			reanswer?: unknown;
			exactLeaf?: boolean;
			restoreRoot?: boolean;
	  }
	| { kind: "session.tree.branch"; targetId: string }
	| { kind: "turn.retry" }
	| { kind: "core.continue" }
	| { kind: "core.prompt"; text: string; images?: unknown[] }
	| { kind: "core.steer"; text: string; images?: unknown[] }
	| { kind: "core.followUp"; text: string; images?: unknown[] }
	| { kind: "core.abort" }
	| {
			kind: "loop.enable";
			prompt?: string;
			limit?: { turns?: number; minutes?: number; tokens?: number };
			condition?: { command: string; until: boolean };
	  }
	| { kind: "loop.pause" }
	| { kind: "loop.disable" }
	| { kind: "mode.plan.enter"; initialPrompt?: string }
	| { kind: "mode.plan.exit"; discardDraft?: boolean }
	| { kind: "mode.plan.review.open" }
	| { kind: "mode.plan.review.saveAndQuit"; path: string }
	| {
			kind: "mode.plan.review.respond";
			decision: "execute" | "compact" | "keep" | "approve" | "refine" | "dismiss";
			feedback?: string;
	  }
	| { kind: "mode.vibe.enter"; initialPrompt?: string }
	| { kind: "mode.vibe.exit" }
	| { kind: "goal.create"; objective: string; tokenBudget?: number }
	| { kind: "goal.replace"; objective: string; tokenBudget?: number }
	| { kind: "goal.show" }
	| { kind: "goal.setBudget"; tokenBudget?: number }
	| { kind: "goal.pause" }
	| { kind: "goal.resume" }
	| { kind: "goal.drop" }
	| { kind: "goal.guided.start"; initial?: string }
	| { kind: "btw.ask"; question: string; images?: ImageContent[]; command?: { name: string; arguments: string } }
	| { kind: "btw.abort"; ephemeralId: string }
	| { kind: "btw.branch"; branchToken: string }
	| { kind: "tan.start"; work: string }
	| { kind: "omfg.generate"; complaint: string }
	| { kind: "omfg.amend"; candidateId: string; feedback: string }
	| { kind: "omfg.commit"; candidateId: string; scope: "project" | "user"; overwrite: boolean }
	| { kind: "agent.list"; includeTerminal?: boolean; includePersisted?: boolean }
	| { kind: "agent.get"; agentId: string }
	| {
			kind: "agent.spawn";
			definition: string;
			model?: string[];
			assignment?: string;
			taskFile?: string;
			solutionSpace?: string;
			context?: string;
			async?: boolean;
			isolation?: string;
			effort?: string;
	  }
	| {
			kind: "agent.send";
			agentId: string;
			expectedGeneration: number;
			text: string;
			mode: "prompt" | "steer" | "followUp";
			images?: unknown[];
	  }
	| { kind: "agent.kill"; agentId: string; expectedGeneration: number }
	| { kind: "agent.revive"; agentId: string; expectedGeneration: number }
	| { kind: "agent.release"; agentId: string; expectedGeneration: number }
	| { kind: "agent.transcript.read"; agentId: string; cursor?: string; limit?: number }
	| { kind: "agent.conversation.read"; agentId: string; cursor?: string; limit?: number }
	| { kind: "agent.subscribe"; level: "progress" | "events" }
	| { kind: "job.list"; ownerAgentId?: string; includeRecent?: boolean }
	| { kind: "job.get"; jobId: string }
	| { kind: "job.cancel"; jobId: string; expectedGeneration: number }
	| { kind: "job.subscribe" }
	| { kind: "operator.manifest.get" }
	| { kind: "operator.invoke"; commandId: string; arguments?: unknown }
	| { kind: "permissions.mode.set"; mode: "always-ask" | "always-ask-cached" | "write" | "yolo"; persist: boolean }
	| { kind: "tui.transfer"; commandId: string; interactionId?: string }
	| {
			kind: "interaction.respond";
			interactionId: string;
			commandId: string;
			decision: "submit" | "cancel";
			value?: unknown;
	  };

export type HarnessRemoteInteractionRequest =
	| {
			kind: "confirm";
			interactionId: string;
			commandId: string;
			title: string;
			message: string;
			destructive?: boolean;
	  }
	| {
			kind: "select";
			interactionId: string;
			commandId: string;
			title: string;
			options: Array<{ id: string; label: string; description?: string }>;
			multiple?: boolean;
	  }
	| {
			kind: "input";
			interactionId: string;
			commandId: string;
			title: string;
			placeholder?: string;
			secret?: boolean;
	  }
	| {
			kind: "editor";
			interactionId: string;
			commandId: string;
			title: string;
			content?: string;
			language?: string;
			promptStyle?: boolean;
	  }
	| {
			kind: "approval";
			interactionId: string;
			commandId: string;
			title: string;
			approvalType: string;
			details: unknown;
			/** Label of the "approve for this session" choice, when offered. */
			session?: string;
			/** Remembered-approval choices of an `always-ask-cached` prompt. */
			grants?: ReadonlyArray<{ scope: "folder" | "target"; label: string; alwaysLabel: string }>;
	  }
	| {
			kind: "ask";
			acceptImages?: boolean;
			interactionId: string;
			commandId: string;
			title: string;
			questions: HarnessAskQuestion[];
	  };

export type HarnessAskOption = {
	id: string;
	label: string;
	description?: string;
	preview?: string;
};

export type HarnessAskQuestion = {
	id: string;
	question: string;
	header?: string;
	options: HarnessAskOption[];
	multiple?: boolean;
	recommended?: number;
};

export interface HarnessInteractionRequiredEvent {
	kind: "interaction.required";
	request: HarnessRemoteInteractionRequest;
	owner: "gui" | "tui";
	leaseGeneration: number;
}

export interface HarnessInteractionResolvedEvent {
	kind: "interaction.resolved";
	interactionId: string;
	commandId: string;
	leaseGeneration: number;
	outcome: "submitted" | "cancelled" | "aborted" | "expired";
}

export interface HarnessRequest {
	type: "harness.request";
	requestId: string;
	runtimeEpoch: number;
	expectedStateVersion?: number;
	idempotencyKey?: string;
	operation: HarnessOperation;
}

export interface HarnessProtocolError {
	code:
		| "CAPABILITY_UNAVAILABLE"
		| "RUNTIME_EPOCH_STALE"
		| "STATE_VERSION_CONFLICT"
		| "CURSOR_STALE"
		| "COMMAND_UNKNOWN"
		| "COMMAND_BLOCKED"
		| "INTERACTION_REQUIRED"
		| "INTERACTION_STALE"
		| "NOT_OWNER"
		| "INVALID_ARGUMENT"
		| "BUSY_STREAMING"
		| "BUSY_COMPACTING"
		| "MODE_CONFLICT"
		| "AGENT_GENERATION_CONFLICT"
		| "JOB_GENERATION_CONFLICT"
		| "TERMINAL_REQUIRED"
		| "INTERNAL_ERROR";
	message: string;
	retryable: boolean;
	details?: Record<string, unknown>;
}

export interface HarnessReceipt<TResult = unknown> {
	type: "harness.receipt";
	requestId: string;
	commandId?: string;
	runtimeEpoch: number;
	stateVersion: number;
	status: "accepted" | "completed" | "rejected" | "failed" | "outcome_unknown";
	result?: TResult;
	error?: HarnessProtocolError;
}

export interface HarnessEventEnvelope {
	type: "harness.event";
	runtimeEpoch: number;
	eventSeq: number;
	stateVersion: number;
	occurredAt: string;
	event:
		| { kind: "state.changed"; snapshot: HarnessOperatorStateSnapshot }
		| { kind: "runtime.quiescing" }
		| { kind: "runtime.shutdownComplete" }
		| HarnessInteractionRequiredEvent
		| HarnessInteractionResolvedEvent
		| { kind: "btw.changed"; snapshot: HarnessBtwSnapshot }
		| { kind: "evaluation.changed"; id: string; revision: number }
		| { kind: "session.telemetry.changed"; sessionId: string; telemetry: HarnessSessionTelemetry }
		| ConversationRuntimeEvent;
}

export interface HarnessSessionTelemetry {
	treeCost?: number;
	budget?: { warnCost: number | null; maxCost: number | null; limitReached: boolean };
	editRejections?: Record<string, number>;
	advisorCost?: number;
	generationTps?: number;
	requestedModel?: string;
	servedModel?: string;
	sessionId: string;
	capturedAt: string;
	tokens: {
		input: number;
		output: number;
		reasoning: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
		cost: number;
	};
	lastCompletedTurn?: {
		input: number;
		output: number;
		reasoning: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
		cost: number;
		completedAt: string;
		/** Provider request wall time in milliseconds; absent when unmeasured. */
		durationMs?: number;
		/** Output tokens per second over `durationMs`; absent when underivable. */
		tps?: number;
	};
	context: {
		contextWindow: number;
		usedTokens: number;
		percent: number;
		anchored: boolean;
		systemPromptTokens: number;
		systemContextTokens: number;
		systemToolsTokens: number;
		skillsTokens: number;
		messagesTokens: number;
	} | null;
	unavailableReason?: "runtime_not_ready" | "model_context_unknown" | "probe_dynamic_context_disabled";
}

/** Full recoverable pending interaction carried by the snapshot. */
export interface HarnessPendingInteraction {
	request: HarnessRemoteInteractionRequest;
	owner: "gui" | "tui";
	leaseGeneration: number;
}

/** Upstream `RuntimeIdentity`: the omp build that wrote session entries. */
export interface HarnessRuntimeIdentity {
	version: string;
	commit?: string;
	branch?: string;
	diff?: string;
	label?: string;
}

export interface HarnessRuntimeIdentitySnapshot {
	current: HarnessRuntimeIdentity;
	/** Builds in file order, consecutive repeats collapsed; `null` = entries written without a stamp. */
	history: Array<HarnessRuntimeIdentity | null>;
}

export interface HarnessOperatorStateSnapshot {
	continuationOf?: string;
	resumedFromSessionId?: string;
	runtimeId: string;
	runtimeEpoch: number;
	stateVersion: number;
	sessionId: string;
	/** Runtime stays connected while the main AgentSession Worker sleeps/revives. */
	workerResidency?: "active" | "sleeping" | "recycling" | "reviving" | "dormant" | "failed";
	workerGeneration?: number;
	/** Optional semantic projection of the native SessionManager title state. */
	sessionTitle?: string;
	sessionTitleSource?: "user" | "auto";
	isStreaming: boolean;
	isCompacting: boolean;
	activeMode: "normal" | "plan" | "goal" | "vibe";
	approvalMode: "always-ask" | "always-ask-cached" | "write" | "yolo";
	plan?: { status: "off" | "active" | "paused" | "review"; planReference?: string; title?: string; body?: string };
	goal?: {
		status: "off" | "active" | "paused" | "complete";
		objective?: string;
		tokenBudget?: number;
		tokensUsed?: number;
	};
	vibe?: { enabled: boolean; workerAgentIds: string[] };
	loop?: {
		status: "waiting" | "running" | "paused";
		prompt?: string;
		iterations?: number;
		condition?: { command: string; until: boolean };
		evaluatingCondition?: boolean;
	};
	fast?: { enabled: boolean; active?: boolean };
	prewalk?: { status: "off" | "armed" | "active"; target?: string };
	/** Active session model; absent before the first model resolves. */
	model?: HarnessModelState;
	/** Session-scoped Task subagent model override; absent while inheriting. */
	taskModel?: HarnessModelState;
	pause?: {
		paused: boolean;
		pauseEpoch?: number;
		pausedAt?: string;
		unsettledTurns?: number;
		unfinishedJobs?: number;
	};
	live?: { status: "off" | "connecting" | "active" | "stopping" | "failed"; deviceId?: string };
	pendingInteraction?: HarnessPendingInteraction;
	pendingMessages: number;
	activeCommandIds: string[];
	agentsRevision: number;
	jobsRevision: number;
	agents: unknown[];
	jobs: unknown[];
	/** Lineage of the agents that own `jobs`, for building the job tree. */
	jobAgents?: Array<{ id: string; parentId?: string }>;
	/**
	 * The last run ended non-terminally and only a background-job result can
	 * resume it (upstream `agent_end.awaitingAsyncWork`). Cleared when a run
	 * starts, the run settles terminally, or no job is left running.
	 */
	awaitingAsyncWork?: boolean;
	/**
	 * How the last turn on the active branch ended, from the tail assistant
	 * message's `stopReason`: `interrupted` covers an operator abort, a provider
	 * error, and the record load recovery appends after a process exit.
	 */
	lastTurnOutcome?: "completed" | "interrupted";
	/** omp builds that wrote this session, oldest first, ending with the running one. */
	runtimeIdentity?: HarnessRuntimeIdentitySnapshot;
	telemetry?: HarnessSessionTelemetry;
	runtimeSettings?: Record<HarnessRuntimeSettingKey, unknown>;
	runtimeSettingsActivation?: HarnessRuntimeSettingsActivation;
	retry?: HarnessRetryState;
	compactionSpeculation?: "idle" | "running" | "armed";
}

export interface HarnessSnapshotResponse {
	type: "harness.snapshot";
	requestId: string;
	snapshot: HarnessOperatorStateSnapshot;
	commandManifestHash: string;
	capabilityHash: string;
	lastEventSeq: number;
	/**
	 * Head-cursor hint for the active-branch transcript at snapshot time.
	 * It does not carry message bodies. Tamper → INVALID_ARGUMENT;
	 * wrong session/branch/epoch → CURSOR_STALE.
	 */
	messagesCursor?: string;
	terminalReceipts: HarnessReceipt[];
}

export interface DecodedHarnessFrame {
	header: {
		protocol: typeof HARNESS_PROTOCOL_NAME;
		version: typeof HARNESS_PROTOCOL_VERSION;
		frameId: string;
		runtimeEpoch: number;
		bodyLength: number;
	};
	body: unknown;
}

export class HarnessFrameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HarnessFrameError";
	}
}

function record(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new HarnessFrameError("Expected object");
	return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
	const allowedSet = new Set(allowed);
	if (Object.keys(value).some(key => !allowedSet.has(key))) throw new HarnessFrameError("Unknown field");
}

function nonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function assertJsonValue(value: unknown, seen = new Set<object>()): void {
	if (value === null || typeof value === "string" || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new HarnessFrameError("Invalid JSON number");
		return;
	}
	if (typeof value !== "object") throw new HarnessFrameError("Invalid JSON value");
	if (seen.has(value)) throw new HarnessFrameError("Cyclic JSON value");
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			for (const item of value) assertJsonValue(item, seen);
			return;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) throw new HarnessFrameError("Invalid JSON object");
		for (const item of Object.values(value as Record<string, unknown>)) assertJsonValue(item, seen);
	} finally {
		seen.delete(value);
	}
}

/**
 * Session-level thinking selectors accepted over the Bridge. `auto` is a
 * session-only mode; `inherit` is excluded because it resolves back to the
 * provider default instead of expressing an operator selection.
 */
const HARNESS_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max", "auto"]);

export function parseHarnessHelloRequest(value: unknown): HarnessHelloRequest {
	const input = record(value);
	exactKeys(input, ["type", "requestId", "supportedProtocolVersions", "requiredProfile", "challenge"]);
	if (
		input.type !== "harness.hello" ||
		!nonEmptyString(input.requestId) ||
		!nonEmptyString(input.challenge) ||
		input.requiredProfile !== "full-parity-v1" ||
		!Array.isArray(input.supportedProtocolVersions) ||
		input.supportedProtocolVersions.length === 0 ||
		input.supportedProtocolVersions.some(version => !Number.isSafeInteger(version) || version <= 0) ||
		new Set(input.supportedProtocolVersions).size !== input.supportedProtocolVersions.length
	) {
		throw new HarnessFrameError("Invalid Harness hello request");
	}
	return input as unknown as HarnessHelloRequest;
}

export function parseHarnessRequest(value: unknown): HarnessRequest {
	const input = record(value);
	exactKeys(input, ["type", "requestId", "runtimeEpoch", "expectedStateVersion", "idempotencyKey", "operation"]);
	const operation = record(input.operation);
	if (
		input.type !== "harness.request" ||
		!nonEmptyString(input.requestId) ||
		!Number.isSafeInteger(input.runtimeEpoch) ||
		(input.runtimeEpoch as number) <= 0 ||
		(input.expectedStateVersion !== undefined &&
			(!Number.isSafeInteger(input.expectedStateVersion) || (input.expectedStateVersion as number) < 0)) ||
		(input.idempotencyKey !== undefined && !nonEmptyString(input.idempotencyKey)) ||
		!nonEmptyString(operation.kind)
	) {
		throw new HarnessFrameError("Invalid Harness request");
	}
	if (operation.kind === "session.owner.update") return input as unknown as HarnessRequest;
	if (isRuntimeViewKind(operation.kind)) return input as unknown as HarnessRequest;
	if (isContextViewKind(operation.kind)) return input as unknown as HarnessRequest;
	if (isEvaluationOperationKind(operation.kind)) {
		validateEvaluationOperation(operation);
		return input as unknown as HarnessRequest;
	}
	if (typeof operation.kind === "string" && isWorkbenchOperationKind(operation.kind)) {
		try {
			validateWorkbenchOperation(operation);
		} catch (error) {
			throw new HarnessFrameError(error instanceof Error ? error.message : "Invalid Runtime operation");
		}
		return input as unknown as HarnessRequest;
	}
	if (typeof operation.kind === "string" && isUpgradeOperationKind(operation.kind)) {
		try {
			validateUpgradeOperation(operation);
		} catch (error) {
			throw new HarnessFrameError(error instanceof Error ? error.message : "Invalid Runtime operation");
		}
		return input as unknown as HarnessRequest;
	}
	switch (operation.kind) {
		case "prediction.query": {
			const { kind, ...query } = operation;
			validatePredictionQuery(query);
			break;
		}
		case "runtime.snapshot":
			exactKeys(operation, ["kind", "timeTravelCapture"]);
			break;
		case "runtime.pause":
			exactKeys(operation, ["kind"]);
			break;
		case "runtime.settings.get":
			exactKeys(operation, ["kind", "keys", "checkHindsight"]);
			if (operation.checkHindsight !== undefined && typeof operation.checkHindsight !== "boolean")
				throw new Error("Invalid Hindsight check flag");
			if (operation.keys !== undefined) {
				if (
					!Array.isArray(operation.keys) ||
					operation.keys.length === 0 ||
					operation.keys.length > HARNESS_RUNTIME_SETTING_KEYS.length ||
					operation.keys.some(key => !isHarnessRuntimeSettingKey(key)) ||
					new Set(operation.keys).size !== operation.keys.length
				) {
					throw new HarnessFrameError("Invalid Runtime settings selection");
				}
			}
			break;
		case "runtime.settings.set":
			exactKeys(operation, ["kind", "key", "value", "persist"]);
			if (
				!isHarnessRuntimeSettingKey(operation.key) ||
				!isHarnessRuntimeSettingValue(operation.key, operation.value) ||
				typeof operation.persist !== "boolean"
			) {
				throw new HarnessFrameError("Invalid Runtime setting");
			}
			break;
		case "runtime.resume":
			exactKeys(operation, ["kind", "expectedPauseEpoch"]);
			if (!Number.isSafeInteger(operation.expectedPauseEpoch) || (operation.expectedPauseEpoch as number) < 0) {
				throw new HarnessFrameError("Invalid pause epoch");
			}
			break;
		case "runtime.shutdown":
			exactKeys(operation, ["kind", "drain"]);
			if (operation.drain !== true) throw new HarnessFrameError("Runtime shutdown must drain");
			break;
		case "live.start":
			exactKeys(operation, ["kind", "deviceId"]);
			if (operation.deviceId !== undefined && !nonEmptyString(operation.deviceId)) {
				throw new HarnessFrameError("Invalid Live device id");
			}
			break;
		case "live.stop":
			exactKeys(operation, ["kind"]);
			break;
		case "queue.enqueue":
			exactKeys(operation, ["kind", "text"]);
			if (!nonEmptyString(operation.text)) throw new HarnessFrameError("Invalid queue text");
			break;
		case "session.clearContext":
		case "session.drop":
		case "session.fork":
		case "session.tree.get":
		case "turn.retry":
		case "core.continue":
		case "core.abort":
		case "loop.pause":
		case "loop.disable":
		case "mode.plan.review.open":
		case "mode.vibe.exit":
		case "goal.show":
		case "goal.pause":
		case "goal.resume":
		case "goal.drop":
		case "operator.manifest.get":
			exactKeys(operation, ["kind"]);
			break;
		case "mode.plan.review.saveAndQuit":
			exactKeys(operation, ["kind", "path"]);
			if (
				!nonEmptyString(operation.path) ||
				operation.path !== operation.path.trim() ||
				operation.path.length > 1024 ||
				operation.path.includes("\0") ||
				(operation.path.startsWith('"') && operation.path.endsWith('"')) ||
				(operation.path.startsWith("'") && operation.path.endsWith("'")) ||
				operation.path.replaceAll("\\", "/").startsWith("/") ||
				operation.path.replaceAll("\\", "/").startsWith("~") ||
				/^[A-Za-z]:/.test(operation.path) ||
				operation.path.replaceAll("\\", "/").endsWith("/") ||
				operation.path
					.replaceAll("\\", "/")
					.split("/")
					.some(segment => segment === ".." || segment.includes(":")) ||
				operation.path
					.replaceAll("\\", "/")
					.split("/")
					.every(segment => segment.length === 0 || segment === ".")
			) {
				throw new HarnessFrameError("Invalid Plan save path");
			}
			break;
		case "session.handoff":
			exactKeys(operation, ["kind", "customInstructions"]);
			if (operation.customInstructions !== undefined && !nonEmptyString(operation.customInstructions)) {
				throw new HarnessFrameError("Invalid handoff instructions");
			}
			break;
		case "session.fast.set":
			exactKeys(operation, ["kind", "enabled"]);
			if (typeof operation.enabled !== "boolean") throw new HarnessFrameError("Invalid fast mode flag");
			break;
		case "session.prewalk.arm":
			exactKeys(operation, ["kind", "target"]);
			if (operation.target !== undefined && !nonEmptyString(operation.target)) {
				throw new HarnessFrameError("Invalid prewalk target");
			}
			break;
		case "session.prewalk.disarm":
		case "session.prewalk.restart":
			exactKeys(operation, ["kind"]);
			break;
		case "session.model.set":
			exactKeys(operation, ["kind", "selector", "thinking"]);
			if (!nonEmptyString(operation.selector)) throw new HarnessFrameError("Invalid model selector");
			if (operation.thinking !== undefined && !HARNESS_THINKING_LEVELS.has(operation.thinking as string)) {
				throw new HarnessFrameError("Invalid thinking level");
			}
			break;
		case "session.thinking.set":
			exactKeys(operation, ["kind", "level"]);
			if (!HARNESS_THINKING_LEVELS.has(operation.level as string)) {
				throw new HarnessFrameError("Invalid thinking level");
			}
			break;
		case "session.taskModel.set":
			exactKeys(operation, ["kind", "selector"]);
			if (operation.selector !== null && !nonEmptyString(operation.selector)) {
				throw new HarnessFrameError("Invalid task model selector");
			}
			break;
		case "mode.plan.enter":
		case "mode.vibe.enter":
			exactKeys(operation, ["kind", "initialPrompt"]);
			if (operation.initialPrompt !== undefined && !nonEmptyString(operation.initialPrompt)) {
				throw new HarnessFrameError("Invalid mode prompt");
			}
			break;
		case "mode.plan.exit":
			exactKeys(operation, ["kind", "discardDraft"]);
			if (operation.discardDraft !== undefined && typeof operation.discardDraft !== "boolean") {
				throw new HarnessFrameError("Invalid plan exit option");
			}
			break;
		case "mode.plan.review.respond":
			exactKeys(operation, ["kind", "decision", "feedback"]);
			if (
				!new Set(["execute", "compact", "keep", "approve", "refine", "dismiss"]).has(operation.decision as string)
			) {
				throw new HarnessFrameError("Invalid plan review decision");
			}
			if (operation.feedback !== undefined && !nonEmptyString(operation.feedback)) {
				throw new HarnessFrameError("Invalid plan review feedback");
			}
			break;
		case "goal.create":
		case "goal.replace":
			exactKeys(operation, ["kind", "objective", "tokenBudget"]);
			if (!nonEmptyString(operation.objective)) throw new HarnessFrameError("Invalid goal objective");
			if (
				operation.tokenBudget !== undefined &&
				(!Number.isSafeInteger(operation.tokenBudget) || (operation.tokenBudget as number) <= 0)
			) {
				throw new HarnessFrameError("Invalid goal token budget");
			}
			break;
		case "goal.setBudget":
			exactKeys(operation, ["kind", "tokenBudget"]);
			if (
				operation.tokenBudget !== undefined &&
				(!Number.isSafeInteger(operation.tokenBudget) || (operation.tokenBudget as number) <= 0)
			) {
				throw new HarnessFrameError("Invalid goal token budget");
			}
			break;
		case "goal.guided.start":
			exactKeys(operation, ["kind", "initial"]);
			if (operation.initial !== undefined && !nonEmptyString(operation.initial)) {
				throw new HarnessFrameError("Invalid guided goal input");
			}
			break;
		case "btw.ask":
			exactKeys(operation, ["kind", "question", "images", "command"]);
			if (!nonEmptyString(operation.question)) throw new HarnessFrameError("Invalid BTW question");
			break;
		case "btw.abort":
			exactKeys(operation, ["kind", "ephemeralId"]);
			if (!nonEmptyString(operation.ephemeralId)) throw new HarnessFrameError("Invalid BTW interaction id");
			break;
		case "btw.branch":
			exactKeys(operation, ["kind", "branchToken"]);
			if (!nonEmptyString(operation.branchToken)) throw new HarnessFrameError("Invalid BTW branch token");
			break;
		case "tan.start":
			exactKeys(operation, ["kind", "work"]);
			if (!nonEmptyString(operation.work)) throw new HarnessFrameError("Invalid TAN work request");
			break;
		case "omfg.generate":
			exactKeys(operation, ["kind", "complaint"]);
			if (!nonEmptyString(operation.complaint)) throw new HarnessFrameError("Invalid OMFG complaint");
			break;
		case "omfg.amend":
			exactKeys(operation, ["kind", "candidateId", "feedback"]);
			if (!nonEmptyString(operation.candidateId) || !nonEmptyString(operation.feedback)) {
				throw new HarnessFrameError("Invalid OMFG amendment");
			}
			break;
		case "omfg.commit":
			exactKeys(operation, ["kind", "candidateId", "scope", "overwrite"]);
			if (
				!nonEmptyString(operation.candidateId) ||
				(operation.scope !== "project" && operation.scope !== "user") ||
				typeof operation.overwrite !== "boolean"
			) {
				throw new HarnessFrameError("Invalid OMFG commit");
			}
			break;
		case "agent.list":
			exactKeys(operation, ["kind", "includeTerminal", "includePersisted"]);
			if (operation.includeTerminal !== undefined && typeof operation.includeTerminal !== "boolean") {
				throw new HarnessFrameError("Invalid agent list option");
			}
			if (operation.includePersisted !== undefined && typeof operation.includePersisted !== "boolean") {
				throw new HarnessFrameError("Invalid agent list option");
			}
			break;
		case "agent.get":
			exactKeys(operation, ["kind", "agentId"]);
			if (!nonEmptyString(operation.agentId)) throw new HarnessFrameError("Invalid agent id");
			break;
		case "agent.spawn":
			exactKeys(operation, [
				"kind",
				"definition",
				"assignment",
				"taskFile",
				"context",
				"async",
				"isolation",
				"effort",
				"model",
				"solutionSpace",
			]);
			if (
				operation.model !== undefined &&
				(!Array.isArray(operation.model) ||
					operation.model.length === 0 ||
					operation.model.length > 8 ||
					operation.model.some(
						value =>
							typeof value !== "string" ||
							!value.trim() ||
							value.length > 1024 ||
							/[\u0000-\u001f]/u.test(value),
					))
			)
				throw new HarnessFrameError("Invalid per-spawn model chain");
			if (
				operation.solutionSpace !== undefined &&
				(!nonEmptyString(operation.solutionSpace) || operation.solutionSpace.length > 65536)
			)
				throw new HarnessFrameError("Invalid solution space");
			if (
				!nonEmptyString(operation.definition) ||
				(operation.assignment !== undefined && !nonEmptyString(operation.assignment))
			) {
				throw new HarnessFrameError("Invalid agent spawn request");
			}
			if (operation.context !== undefined && !nonEmptyString(operation.context)) {
				throw new HarnessFrameError("Invalid agent context");
			}
			if (operation.async !== undefined && typeof operation.async !== "boolean") {
				throw new HarnessFrameError("Invalid agent async option");
			}
			if (operation.isolation !== undefined && operation.isolation !== "patch" && operation.isolation !== "branch") {
				throw new HarnessFrameError("Invalid agent isolation");
			}
			if (
				operation.effort !== undefined &&
				operation.effort !== "lo" &&
				operation.effort !== "med" &&
				operation.effort !== "hi"
			) {
				throw new HarnessFrameError("Invalid agent effort");
			}
			break;
		case "agent.send":
			exactKeys(operation, ["kind", "agentId", "expectedGeneration", "text", "mode", "images"]);
			if (
				!nonEmptyString(operation.agentId) ||
				!Number.isSafeInteger(operation.expectedGeneration) ||
				(operation.expectedGeneration as number) < 1 ||
				!nonEmptyString(operation.text) ||
				!new Set(["prompt", "steer", "followUp"]).has(operation.mode as string)
			) {
				throw new HarnessFrameError("Invalid agent message");
			}
			if (operation.images !== undefined) {
				if (
					!Array.isArray(operation.images) ||
					operation.images.some(image => image === null || typeof image !== "object" || Array.isArray(image))
				) {
					throw new HarnessFrameError("Invalid image attachments");
				}
			}
			break;
		case "agent.kill":
		case "agent.revive":
		case "agent.release":
			exactKeys(operation, ["kind", "agentId", "expectedGeneration"]);
			if (
				!nonEmptyString(operation.agentId) ||
				!Number.isSafeInteger(operation.expectedGeneration) ||
				(operation.expectedGeneration as number) < 1
			) {
				throw new HarnessFrameError("Invalid agent lifecycle request");
			}
			break;
		case "agent.transcript.read":
			exactKeys(operation, ["kind", "agentId", "cursor", "limit"]);
			if (!nonEmptyString(operation.agentId)) throw new HarnessFrameError("Invalid agent id");
			if (operation.cursor !== undefined && !nonEmptyString(operation.cursor)) {
				throw new HarnessFrameError("Invalid transcript cursor");
			}
			if (
				operation.limit !== undefined &&
				(!Number.isSafeInteger(operation.limit) || (operation.limit as number) < 1)
			) {
				throw new HarnessFrameError("Invalid transcript limit");
			}
			break;
		case "agent.conversation.read":
			exactKeys(operation, ["kind", "agentId", "cursor", "limit"]);
			if (!nonEmptyString(operation.agentId)) throw new HarnessFrameError("Invalid agent id");
			if (
				operation.cursor !== undefined &&
				(!nonEmptyString(operation.cursor) ||
					(operation.cursor as string).length > CONVERSATION_LIMITS.CURSOR_MAX_CHARS)
			) {
				throw new HarnessFrameError("Invalid transcript cursor");
			}
			if (
				operation.limit !== undefined &&
				(!Number.isSafeInteger(operation.limit) ||
					(operation.limit as number) < 1 ||
					(operation.limit as number) > CONVERSATION_LIMITS.TRANSCRIPT_LIMIT_MAX)
			) {
				throw new HarnessFrameError("Invalid transcript limit");
			}
			break;
		case SESSION_TRANSCRIPT_READ_KIND:
			exactKeys(operation, ["kind", "cursor", "limit"]);
			if (
				operation.cursor !== undefined &&
				(!nonEmptyString(operation.cursor) ||
					(operation.cursor as string).length > CONVERSATION_LIMITS.CURSOR_MAX_CHARS)
			) {
				throw new HarnessFrameError("Invalid transcript cursor");
			}
			if (
				operation.limit !== undefined &&
				(!Number.isSafeInteger(operation.limit) ||
					(operation.limit as number) < CONVERSATION_LIMITS.TRANSCRIPT_LIMIT_MIN ||
					(operation.limit as number) > CONVERSATION_LIMITS.TRANSCRIPT_LIMIT_MAX)
			) {
				throw new HarnessFrameError("Invalid transcript limit");
			}
			break;
		case "agent.subscribe":
			exactKeys(operation, ["kind", "level"]);
			if (operation.level !== "progress" && operation.level !== "events") {
				throw new HarnessFrameError("Invalid agent subscription");
			}
			break;
		case "job.list":
			exactKeys(operation, ["kind", "ownerAgentId", "includeRecent"]);
			if (operation.ownerAgentId !== undefined && !nonEmptyString(operation.ownerAgentId)) {
				throw new HarnessFrameError("Invalid job owner");
			}
			if (operation.includeRecent !== undefined && typeof operation.includeRecent !== "boolean") {
				throw new HarnessFrameError("Invalid recent jobs option");
			}
			break;
		case "job.get":
			exactKeys(operation, ["kind", "jobId"]);
			if (!nonEmptyString(operation.jobId)) throw new HarnessFrameError("Invalid job id");
			break;
		case "job.cancel":
			exactKeys(operation, ["kind", "jobId", "expectedGeneration"]);
			if (
				!nonEmptyString(operation.jobId) ||
				!Number.isSafeInteger(operation.expectedGeneration) ||
				(operation.expectedGeneration as number) < 1
			) {
				throw new HarnessFrameError("Invalid job cancellation");
			}
			break;
		case "job.subscribe":
			exactKeys(operation, ["kind"]);
			break;
		case "session.tree.navigate":
			exactKeys(operation, [
				"kind",
				"targetId",
				"summarize",
				"customInstructions",
				"reanswer",
				"exactLeaf",
				"restoreRoot",
			]);
			if (!nonEmptyString(operation.targetId)) throw new HarnessFrameError("Invalid tree target");
			if (operation.summarize !== undefined && typeof operation.summarize !== "boolean") {
				throw new HarnessFrameError("Invalid tree summarize option");
			}
			if (operation.customInstructions !== undefined && !nonEmptyString(operation.customInstructions)) {
				throw new HarnessFrameError("Invalid tree instructions");
			}
			if (operation.exactLeaf !== undefined && typeof operation.exactLeaf !== "boolean")
				throw new HarnessFrameError("Invalid exact leaf option");
			if (operation.restoreRoot !== undefined && typeof operation.restoreRoot !== "boolean")
				throw new HarnessFrameError("Invalid root option");
			break;
		case "session.tree.branch":
			exactKeys(operation, ["kind", "targetId"]);
			if (!nonEmptyString(operation.targetId)) throw new HarnessFrameError("Invalid tree target");
			break;
		case "operator.invoke":
			exactKeys(operation, ["kind", "commandId", "arguments"]);
			if (!nonEmptyString(operation.commandId)) throw new HarnessFrameError("Invalid operator command id");
			if ("arguments" in operation) assertJsonValue(operation.arguments);
			break;
		case "interaction.respond":
			exactKeys(operation, ["kind", "interactionId", "commandId", "decision", "value"]);
			if (!nonEmptyString(operation.interactionId) || !nonEmptyString(operation.commandId)) {
				throw new HarnessFrameError("Invalid interaction identity");
			}
			if (operation.decision !== "submit" && operation.decision !== "cancel") {
				throw new HarnessFrameError("Invalid interaction decision");
			}
			if ("value" in operation) assertJsonValue(operation.value);
			break;
		case "permissions.mode.set":
			exactKeys(operation, ["kind", "mode", "persist"]);
			if (
				(operation.mode !== "always-ask" &&
					operation.mode !== "always-ask-cached" &&
					operation.mode !== "write" &&
					operation.mode !== "yolo") ||
				typeof operation.persist !== "boolean"
			) {
				throw new HarnessFrameError("Invalid approval mode operation");
			}
			break;
		case "tui.transfer":
			exactKeys(operation, ["kind", "commandId", "interactionId"]);
			if (!nonEmptyString(operation.commandId)) throw new HarnessFrameError("Invalid transfer command id");
			if (operation.interactionId !== undefined && !nonEmptyString(operation.interactionId)) {
				throw new HarnessFrameError("Invalid transfer interaction id");
			}
			break;
		case "loop.enable": {
			exactKeys(operation, ["kind", "prompt", "limit", "condition"]);
			if (operation.condition !== undefined) {
				const condition = record(operation.condition);
				exactKeys(condition, ["command", "until"]);
				if (!nonEmptyString(condition.command) || typeof condition.until !== "boolean") {
					throw new HarnessFrameError("Invalid loop condition");
				}
			}
			if (operation.prompt !== undefined && !nonEmptyString(operation.prompt)) {
				throw new HarnessFrameError("Invalid loop prompt");
			}
			if (operation.limit !== undefined) {
				const limit = record(operation.limit);
				exactKeys(limit, ["turns", "minutes", "tokens"]);
				for (const value of Object.values(limit)) {
					if (!Number.isSafeInteger(value) || (value as number) <= 0) {
						throw new HarnessFrameError("Invalid loop limit");
					}
				}
			}
			break;
		}
		case "core.prompt":
		case "core.steer":
		case "core.followUp":
			exactKeys(operation, ["kind", "text", "images"]);
			if (!nonEmptyString(operation.text)) throw new HarnessFrameError("Invalid prompt text");
			if (operation.images !== undefined) {
				if (
					!Array.isArray(operation.images) ||
					operation.images.some(image => image === null || typeof image !== "object" || Array.isArray(image))
				) {
					throw new HarnessFrameError("Invalid image attachments");
				}
			}
			break;
		default:
			exactKeys(operation, ["kind"]);
	}
	return input as unknown as HarnessRequest;
}

export const parseHarnessSnapshotRequest = parseHarnessRequest;

export function createChallengeProof(token: string, challenge: string, runtimeInstanceId: string): string {
	return crypto
		.createHmac("sha256", token)
		.update(challenge)
		.update("\0")
		.update(runtimeInstanceId)
		.digest("base64url");
}

export function stableEmptyManifestHash(kind: "capabilities" | "commands"): string {
	return `sha256:${crypto.createHash("sha256").update(`${kind}:[]`).digest("hex")}`;
}

export const HARNESS_IMPLEMENTED_CAPABILITIES = [
	"timeTravel.capture",
	...COMPUTER_WORKSPACE_QUERY_KINDS,
	...CONTEXT_VIEW_KINDS,
	...RUNTIME_VIEW_KINDS,
	"settings.approval",
	"prediction.query",
	"composer.predictions",
	...WORKBENCH_OPERATION_KINDS,
	...UPGRADE_OPERATION_KINDS,
	"runtime.pause",
	"runtime.resume",
	"runtime.snapshot",
	"session.owner.update",
	"runtime.settings.get",
	"runtime.settings.set",
	"runtime.shutdown",
	"live.start",
	"live.stop",
	"queue.enqueue",
	"session.clearContext",
	"session.drop",
	"turn.retry",
	"core.continue",
	"core.prompt",
	"core.steer",
	"core.followUp",
	"core.abort",
	"loop.enable",
	"loop.pause",
	"loop.disable",
	"session.fast.set",
	"session.prewalk.arm",
	"session.prewalk.disarm",
	"session.prewalk.restart",
	"mode.plan.enter",
	"mode.plan.exit",
	"mode.plan.review.open",
	"mode.plan.review.saveAndQuit",
	"mode.plan.review.respond",
	"mode.vibe.enter",
	"mode.vibe.exit",
	"goal.create",
	"goal.replace",
	"goal.show",
	"goal.setBudget",
	"goal.pause",
	"goal.resume",
	"goal.drop",
	"goal.guided.start",
	"btw.ask",
	"btw.abort",
	"btw.branch",
	"tan.start",
	"omfg.generate",
	"omfg.amend",
	"omfg.commit",
	"agent.list",
	"agent.get",
	"agent.spawn",
	"agent.send",
	"agent.kill",
	"agent.revive",
	"agent.release",
	"agent.transcript.read",
	"agent.conversation.read",
	"agent.subscribe",
	"job.list",
	"job.get",
	"job.cancel",
	"job.subscribe",
	"session.tree.get",
	"session.tree.navigate",
	"session.tree.branch",
	"session.fork",
	"session.handoff",
	"session.model.set",
	"session.thinking.set",
	"session.taskModel.set",
	"session.history",
	"session.transcript.read",
	"operator.manifest.get",
	"operator.invoke",
	"permissions.mode.set",
	"interaction.respond",
	"tui.transfer",
	"remoteUi.standard",
	"tui.manualCompatibility",
] as const;

/** Capabilities that exist but are graded `limited` in the hello manifest. */
export const HARNESS_LIMITED_CAPABILITIES: Readonly<Record<string, { limitations: readonly string[] }>> = {
	"live.start": {
		limitations: ["Requires a frontend-owned authenticated audio device and media sideband"],
	},
	"live.stop": {
		limitations: ["Live start is unavailable until a frontend media sideband is attached"],
	},
	"loop.enable": {
		limitations: ["Token limits are unsupported; use turns or minutes"],
	},
};

export function stableImplementedManifestHash(kind: "capabilities" | "commands"): string {
	const content =
		kind === "capabilities"
			? HARNESS_IMPLEMENTED_CAPABILITIES.map(id => ({
					id,
					grade: HARNESS_LIMITED_CAPABILITIES[id] === undefined ? "stable" : "limited",
					limitations: HARNESS_LIMITED_CAPABILITIES[id]?.limitations ?? [],
				}))
			: HARNESS_IMPLEMENTED_CAPABILITIES;
	return `sha256:${crypto
		.createHash("sha256")
		.update(`${kind}:${JSON.stringify(content)}`)
		.digest("hex")}`;
}

export function encodeHarnessFrame(frameId: string, runtimeEpoch: number, body: unknown): Buffer {
	const bodyBytes = Buffer.from(JSON.stringify(body), "utf8");
	const header = {
		protocol: HARNESS_PROTOCOL_NAME,
		version: HARNESS_PROTOCOL_VERSION,
		frameId,
		runtimeEpoch,
		bodyLength: bodyBytes.byteLength,
	};
	const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
	const payloadLength = LENGTH_PREFIX_BYTES + headerBytes.byteLength + bodyBytes.byteLength;
	if (payloadLength > DEFAULT_MAX_CONTROL_FRAME_BYTES) throw new HarnessFrameError("Frame exceeds limit");
	const frame = Buffer.allocUnsafe(LENGTH_PREFIX_BYTES + payloadLength);
	frame.writeUInt32BE(payloadLength, 0);
	frame.writeUInt32BE(headerBytes.byteLength, LENGTH_PREFIX_BYTES);
	headerBytes.copy(frame, LENGTH_PREFIX_BYTES * 2);
	bodyBytes.copy(frame, LENGTH_PREFIX_BYTES * 2 + headerBytes.byteLength);
	return frame;
}

export class HarnessFrameDecoder {
	#buffer = Buffer.alloc(0);
	#failed = false;

	push(chunk: Uint8Array): DecodedHarnessFrame[] {
		if (this.#failed) throw new HarnessFrameError("Decoder closed after protocol error");
		const frames: DecodedHarnessFrame[] = [];
		let offset = 0;
		while (offset < chunk.byteLength || this.#buffer.byteLength >= LENGTH_PREFIX_BYTES) {
			if (this.#buffer.byteLength < LENGTH_PREFIX_BYTES) {
				const count = Math.min(LENGTH_PREFIX_BYTES - this.#buffer.byteLength, chunk.byteLength - offset);
				if (count <= 0) break;
				this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk.subarray(offset, offset + count))]);
				offset += count;
				if (this.#buffer.byteLength < LENGTH_PREFIX_BYTES) break;
			}
			const payloadLength = this.#buffer.readUInt32BE(0);
			if (payloadLength > DEFAULT_MAX_CONTROL_FRAME_BYTES || payloadLength < LENGTH_PREFIX_BYTES) {
				this.#fail("Invalid frame length");
			}
			const frameLength = LENGTH_PREFIX_BYTES + payloadLength;
			if (this.#buffer.byteLength < frameLength && offset < chunk.byteLength) {
				const count = Math.min(frameLength - this.#buffer.byteLength, chunk.byteLength - offset);
				this.#buffer = Buffer.concat([this.#buffer, Buffer.from(chunk.subarray(offset, offset + count))]);
				offset += count;
			}
			if (this.#buffer.byteLength < frameLength) break;
			try {
				const payload = this.#buffer.subarray(LENGTH_PREFIX_BYTES, frameLength);
				const headerLength = payload.readUInt32BE(0);
				if (headerLength <= 0 || headerLength > payloadLength - LENGTH_PREFIX_BYTES) {
					throw new HarnessFrameError("Invalid frame header length");
				}
				const header = record(
					JSON.parse(payload.subarray(LENGTH_PREFIX_BYTES, LENGTH_PREFIX_BYTES + headerLength).toString("utf8")),
				);
				exactKeys(header, ["protocol", "version", "frameId", "runtimeEpoch", "bodyLength"]);
				if (
					header.protocol !== HARNESS_PROTOCOL_NAME ||
					header.version !== HARNESS_PROTOCOL_VERSION ||
					!nonEmptyString(header.frameId) ||
					!Number.isSafeInteger(header.runtimeEpoch) ||
					(header.runtimeEpoch as number) < 0 ||
					!Number.isSafeInteger(header.bodyLength) ||
					(header.bodyLength as number) < 0
				) {
					throw new HarnessFrameError("Invalid frame header");
				}
				const bodyBytes = payload.subarray(LENGTH_PREFIX_BYTES + headerLength);
				if (bodyBytes.byteLength !== header.bodyLength) throw new HarnessFrameError("Frame body length mismatch");
				frames.push({
					header: header as unknown as DecodedHarnessFrame["header"],
					body: JSON.parse(bodyBytes.toString("utf8")) as unknown,
				});
			} catch (error) {
				this.#failed = true;
				this.#buffer = Buffer.alloc(0);
				if (error instanceof HarnessFrameError) throw error;
				throw new HarnessFrameError("Malformed frame");
			}
			this.#buffer = Buffer.alloc(0);
		}
		return frames;
	}

	#fail(message: string): never {
		this.#failed = true;
		this.#buffer = Buffer.alloc(0);
		throw new HarnessFrameError(message);
	}
}
import { type PredictionOperation, validatePredictionQuery } from "./prediction-protocol";

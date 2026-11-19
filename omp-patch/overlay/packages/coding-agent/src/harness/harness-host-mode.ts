import { cfgAsyncEnabled } from "../tools/settings";
import { cfgTaskIsolationMerge, cfgTaskBatch, cfgTaskSteps } from "../task/settings";
import { cfgBtwInject } from "../modes/settings";
import { runtimeText } from "./locale";
import { sendHarnessBtwInjection } from "./services/btw-injection";
import {
	isAgentViewSession,
	isLocalAgentSession,
	type AgentSessionHandle,
	type AgentViewSession,
} from "../session/agent-session-handle";
import { readModelMentions } from "../session/model-mentions";
import type { AgentRegistryApi } from "../registry/agent-registry";
import type { MCPManager } from "../mcp/manager";
import { cfgGcAutoCompress } from "../cli/gc-settings";
import { scheduleGcAutoCompress } from "../cli/gc-auto-compress";
import { HarnessIdleMaintenance } from "./services/idle-maintenance-service";
import { HarnessExtensionModes } from "./services/extension-modes";
import { HarnessCfgService } from "./services/cfg-service";
import { createHarnessAuthBroker } from "./services/auth-broker-service";
import { cfgLoopConditionTimeoutMs, cfgLoopMode } from "../modes/settings";
import { cfgPlanDefaultOnStartup, cfgPlanEnabled } from "../plan-mode/settings";
import { cfgTaskEnableLsp } from "../task/settings";
import { HarnessLiveAudioService } from "./services/live-audio-service";
import { expandModelMentionTags } from "@oh-my-pi/pi-tui/prompt/model-mention-syntax";
import { HarnessWorkbenchService } from "./services/workbench-service";
import { HarnessUpgradeService } from "./services/upgrade-service";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CONFIG_DIR_NAME, logger, postmortem, prompt } from "@oh-my-pi/pi-utils";
import { HarnessEvaluationService } from "./services/evaluation-service";
import { invokeEvalPrelude } from "../eval/preludes";
import { callSessionTool } from "../eval/js/tool-bridge";
import { runEvalAgent } from "../eval/agent-bridge";
import { runEvalCompletion, getCompletionHandle } from "../eval/completion-bridge";
import { runEvalStatus, runEvalWait, runEvalCancel } from "../eval/handle-bridge";
import { runEvalWorkpool } from "../eval/workpool-bridge";
import type { CustomTool } from "../extensibility/custom-tools/types";
import type { ExtensionUIContext, ToolDefinition } from "../extensibility/extensions";
import { IrcBus } from "../irc/bus";
import { evaluateLoopCondition } from "../modes/loop-condition";
import backgroundTanDispatchPrompt from "../prompts/system/background-tan-dispatch.md" with { type: "text" };
import { AgentLifecycleManager } from "../registry/agent-lifecycle";
import { AgentRegistry, MAIN_AGENT_ID } from "../registry/agent-registry";
import { registerPersistedSubagents } from "../registry/persisted-agents";
import * as sdk from "../sdk";
import type { AgentSession } from "../session/agent-session";
import { BACKGROUND_TAN_DISPATCH_MESSAGE_TYPE } from "../session/messages";
import type { SessionEntry } from "../session/session-entries";
import { loadEntriesFromFile } from "../session/session-loader";
import type { SessionManager } from "../session/session-manager";
import { SessionManager as NativeSessionManager } from "../session/session-manager";
import { TaskTool } from "../task";
import type { TaskEffort } from "@oh-my-pi/pi-tui/thinking";
import type { ToolSession } from "../tools";
import { createDefaultToolUiContext, type ToolUiFactory } from "../tools/context";
import { initializeExtensions } from "../modes/runtime-init";
import { HarnessBridgeServer } from "./bridge-server";
import { HarnessRuntimeCommandError } from "./command-arbiter";
import { createHarnessRemoteUiFactory } from "./remote-extension-ui";
import { setHarnessThreadInteraction } from "./services/harness-thread-service";
import { reconstructSessionBranch, HarnessAgentConversationService } from "./services/agent-conversation-service";
import {
	HarnessAgentHubService,
	type HarnessAgentTelemetryPort,
	type HarnessAgentUsage,
} from "./services/agent-hub-service";
import { HarnessBtwService } from "./services/btw-service";
import { HarnessCommandManifestService } from "./services/command-manifest-service";
import { ConversationLiveProjector } from "./services/conversation-live-projector";
import { ConversationProjectorHub } from "./services/conversation-projector-hub";
import { createRuntimePerformanceSampler } from "./services/runtime-performance";
import { HarnessFastPrewalkService } from "./services/fast-prewalk-service";
import { HarnessForkService } from "./services/fork-service";
import { HarnessHandoffService } from "./services/handoff-service";
import { HarnessInteractionGateway } from "./services/interaction-port";
import { HarnessJobService, type HarnessJobsPort, taskJobProgress } from "./services/job-service";
import { HarnessLiveService, type HarnessLiveSessionFactory } from "./services/live-service";
import { HarnessLoopService } from "./services/loop-service";
import { HarnessModeControlService } from "./services/mode-control-service";
import { HarnessModelControlService } from "./services/model-control-service";
import { HarnessOmfgService } from "./services/omfg-service";
import { type HarnessPauseService, harnessPauseService } from "./services/pause-service";
import { HarnessPermissionControlService } from "./services/permission-control-service";
import { HarnessRuntimeSettingsService } from "./services/runtime-settings-service";
import { HarnessSessionTranscriptService } from "./services/session-transcript-service";
import { HarnessTanError, HarnessTanService } from "./services/tan-service";
import { HarnessTreeService } from "./services/tree-service";
import { HarnessTimeTravelBoundary } from "./services/time-travel-boundary";
import { watchHarnessParentFromEnv } from "./parent-watchdog";

export interface HarnessBridgeConfiguration {
	endpoint?: string;
	tokenFile?: string;
	runtimeEpoch?: number;
}

export type HarnessWorkerResidency = "active" | "sleeping" | "recycling" | "reviving" | "dormant" | "failed";

interface HarnessSessionSlot extends AgentSession {
	replace(next: AgentSession): void;
	current(): AgentSession;
	disposeCurrent(): Promise<void>;
}

function createSessionSlot(initial: AgentSession): HarnessSessionSlot {
	let current = initial;
	let beforeNextUserTurn: ((...args: never[]) => unknown) | undefined;
	let afterUserTurn: (() => Promise<void>) | undefined;
	let resetConsentHandler: Parameters<AgentSession["setResetConsentHandler"]>[0];
	const subscriptions = new Map<(...args: never[]) => unknown, () => void>();
	const sessionChangeCallbacks = new Map<(...args: never[]) => unknown, () => void>();
	const attach = (next: AgentSession): void => {
		for (const [listener, unsubscribe] of subscriptions) {
			unsubscribe();
			const nextUnsubscribe = next.subscribe?.(listener as never) ?? (() => {});
			subscriptions.set(listener, nextUnsubscribe);
		}
		for (const [listener, unsubscribe] of sessionChangeCallbacks) {
			unsubscribe();
			const nextUnsubscribe = next.registerSessionChangeCallback?.(listener as never) ?? (() => {});
			sessionChangeCallbacks.set(listener, nextUnsubscribe);
		}
		if (next.setBeforeNextUserTurn) next.setBeforeNextUserTurn(beforeNextUserTurn as never);
		next.setAfterUserTurn?.(afterUserTurn);
		next.setResetConsentHandler?.(resetConsentHandler);
	};
	const slot = new Proxy(initial as HarnessSessionSlot, {
		get(_target, property) {
			if (property === "replace")
				return (next: AgentSession) => {
					current = next;
					attach(next);
				};
			if (property === "current") return () => current;
			if (property === "disposeCurrent")
				return async () => {
					await current.dispose?.();
				};
			if (property === "subscribe") {
				return (listener: (...args: never[]) => unknown) => {
					const unsubscribe = current.subscribe?.(listener as never) ?? (() => {});
					subscriptions.set(listener, unsubscribe);
					return () => {
						subscriptions.get(listener)?.();
						subscriptions.delete(listener);
					};
				};
			}
			if (property === "registerSessionChangeCallback") {
				return (listener: (...args: never[]) => unknown) => {
					const unsubscribe = current.registerSessionChangeCallback?.(listener as never) ?? (() => {});
					sessionChangeCallbacks.set(listener, unsubscribe);
					return () => {
						sessionChangeCallbacks.get(listener)?.();
						sessionChangeCallbacks.delete(listener);
					};
				};
			}
			if (property === "setBeforeNextUserTurn") {
				return (callback: ((...args: never[]) => unknown) | undefined) => {
					beforeNextUserTurn = callback;
					current.setBeforeNextUserTurn?.(callback as never);
				};
			}
			if (property === "setAfterUserTurn") {
				return (callback: (() => Promise<void>) | undefined) => {
					afterUserTurn = callback;
					current.setAfterUserTurn?.(callback);
				};
			}
			if (property === "setResetConsentHandler") {
				return (callback: Parameters<AgentSession["setResetConsentHandler"]>[0]) => {
					resetConsentHandler = callback;
					current.setResetConsentHandler?.(callback);
				};
			}
			const value = Reflect.get(current, property, current);
			return typeof value === "function" ? value.bind(current) : value;
		},
	});
	return slot;
}

export interface HarnessHostRuntime {
	readonly runtimeId: string;
	readonly runtimeEpoch: number;
	readonly sessionId: string;
	readonly session: AgentSession;
	readonly sessionManager: SessionManager;
	readonly resumedFromSessionId?: string;
	readonly workerResidency?: () => HarnessWorkerResidency;
	readonly workerGeneration?: () => number;
	readonly ensureWorkerLive?: () => Promise<void>;
	onWorkerStateChange?(listener: () => void): () => void;
	readonly services: Readonly<{
		pause: HarnessPauseService;
		loop: HarnessLoopService;
		live: HarnessLiveService;
		modes: HarnessModeControlService;
		extensionModes: HarnessExtensionModes;
		idleMaintenance: HarnessIdleMaintenance;
		models: HarnessModelControlService;
		permissions?: HarnessPermissionControlService;
		settings: HarnessRuntimeSettingsService;
		cfg?: HarnessCfgService;
		prediction?: HarnessPredictionService;
		tree: HarnessTreeService;
		fork: HarnessForkService;
		handoff: HarnessHandoffService;
		fastPrewalk: HarnessFastPrewalkService;
		commands: HarnessCommandManifestService;
		btw: HarnessBtwService;
		upgrade: HarnessUpgradeService;
		workbench: HarnessWorkbenchService;
		interaction: HarnessInteractionGateway;
		omfg: HarnessOmfgService;
		tan: HarnessTanService;
		agents: HarnessAgentHubService;
		jobs: HarnessJobService;
		evaluation: HarnessEvaluationService;
		transcript: HarnessSessionTranscriptService;
		agentConversation: HarnessAgentConversationService;
		conversation?: ConversationProjectorHub;
		timeTravel?: HarnessTimeTravelBoundary;
	}>;
	readonly bridgeConfig: Readonly<HarnessBridgeConfiguration>;
	waitForShutdown(): Promise<void>;
	requestShutdown(): void;
	dispose(): void;
}

export interface HarnessBridgeLifecycle {
	start(runtime: HarnessHostRuntime): Promise<void>;
	stop(): Promise<void>;
}

export type HarnessHostTuiRunner = (runtime: HarnessHostRuntime) => Promise<void>;

export type RunHarnessHostMode = (
	session: AgentSession,
	bridgeConfig: HarnessBridgeConfiguration,
	runTui: HarnessHostTuiRunner,
	dependencies?: HarnessHostModeDependencies,
) => Promise<void>;

export interface HarnessHostModeDependencies {
	mcpManager?: MCPManager;
	resumedFromSessionId?: string;
	createBridge?: () => HarnessBridgeLifecycle;
	createRuntimeId?: () => string;
	tanCustomTools?: (CustomTool | ToolDefinition)[];
	liveSessionFactory?: HarnessLiveSessionFactory;
	/**
	 * Tool UI context setter from session creation. When present, the
	 * Harness headless Runtime installs a per-tool-call Remote UI factory
	 * through it (plan §2.5) and invalidates it on dispose.
	 */
	setToolUIContext?: (uiContext: ExtensionUIContext | ToolUiFactory | undefined, hasUI: boolean) => void;
	/** Recreate the main AgentSession from its persisted session file. */
	recreateSession?: (sessionFile: string) => Promise<AgentSession>;
	/** The Host launched a fresh session, rather than resuming a previous one. */
	freshSession?: boolean;
	workerIdleSleepMs?: number;
	workerIdleRecycleMs?: number;
	nowMs?: () => number;
	/** Starts watching the desktop Host; defaults to the pid in `JULING_HARNESS_PARENT_PID`. */
	watchParent?: (onLost: () => void) => () => void;
	/** Hard-exit budget once the Host is gone; defaults to 15 s. */
	hostLossExit?: { readonly delayMs: number; readonly exit: (code: number) => void };
}

/**
 * The desktop Host is gone, so nobody will read results or answer prompts.
 * Stop Live and the loop, abort the turn and shut down without the
 * `runtime.shutdown` drain, which would wait for that turn to finish. A stuck
 * cleanup cannot keep the process alive past the hard-exit budget.
 */
export function abortForHostLoss(
	runtime: HarnessHostRuntime,
	hardExit: { readonly delayMs: number; readonly exit: (code: number) => void } = {
		delayMs: 15_000,
		exit: code => process.exit(code),
	},
): void {
	logger.warn("Harness desktop host is gone; shutting the Runtime down");
	const timer = setTimeout(() => hardExit.exit(1), hardExit.delayMs);
	timer.unref?.();
	try {
		runtime.services.loop.disable();
	} catch {}
	void runtime.services.live.stop().catch(() => undefined);
	void runtime.session.abort({ goalReason: "internal", reason: "Juling Harness exited" }).catch(() => undefined);
	runtime.requestShutdown();
}

function sessionFileOf(session: AgentSession): string | null {
	const manager = session.sessionManager;
	if (typeof manager.getSessionFile !== "function") return null;
	return manager.getSessionFile() ?? null;
}

async function hydratePersistedHarnessAgents(
	registry: AgentRegistryApi,
	sessionFile: string | null,
	shouldContinue?: () => boolean,
): Promise<void> {
	try {
		await registerPersistedSubagents(registry, sessionFile, shouldContinue === undefined ? {} : { shouldContinue });
	} catch (error) {
		logger.warn("Failed to register persisted subagents", { error });
	}
}

function createConfiguredBridge(bridgeConfig: HarnessBridgeConfiguration): HarnessBridgeLifecycle {
	if (
		bridgeConfig.endpoint === undefined ||
		bridgeConfig.tokenFile === undefined ||
		!Number.isSafeInteger(bridgeConfig.runtimeEpoch) ||
		(bridgeConfig.runtimeEpoch as number) <= 0
	) {
		throw new Error("harness-host mode requires --bridge-endpoint, --bridge-token-file, and --bridge-runtime-epoch");
	}
	return new HarnessBridgeServer(bridgeConfig.endpoint, bridgeConfig.tokenFile);
}

function transcriptText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const item of content) {
		if (!item || typeof item !== "object") continue;
		const block = item as Record<string, unknown>;
		if (typeof block.text === "string") parts.push(block.text);
		else if (typeof block.thinking === "string") parts.push(block.thinking);
		else if (block.type === "toolCall" && typeof block.name === "string") {
			parts.push(`${block.name} ${JSON.stringify(block.arguments ?? {})}`);
		}
	}
	return parts.join("\n");
}

function harnessTranscriptMessage(entry: SessionEntry): Array<{
	id: string;
	role: "user" | "assistant" | "custom" | "system";
	ts: number;
	text: string;
}> {
	if (entry.type === "message") {
		if (!("content" in entry.message)) return [];
		const role = entry.message.role === "user" ? "user" : entry.message.role === "assistant" ? "assistant" : "system";
		const text = transcriptText(entry.message.content).trim();
		return text.length === 0 ? [] : [{ id: entry.id, role, ts: Date.parse(entry.timestamp) || 0, text }];
	}
	if (entry.type === "custom_message" && entry.display) {
		const text = transcriptText(entry.content).trim();
		return text.length === 0 ? [] : [{ id: entry.id, role: "custom", ts: Date.parse(entry.timestamp) || 0, text }];
	}
	return [];
}

function harnessToolSession(session: AgentSession): ToolSession {
	return new Proxy(session, {
		get(target, property) {
			if (property === "cwd") return target.sessionManager.getCwd();
			if (property === "getSessionFile") return () => target.sessionManager.getSessionFile() ?? null;
			if (property === "getSessionSpawns") return () => "*";
			const source = target.harnessToolSession ?? target;
			const value = Reflect.get(source, property, source) as unknown;
			return typeof value === "function" ? value.bind(source) : value;
		},
	}) as unknown as ToolSession;
}

interface HarnessAgentTelemetryCache {
	usage?: HarnessAgentUsage;
	model?: string;
	summary?: string;
}

/**
 * Live per-agent telemetry port over AgentSession. Results are cached per
 * agent and invalidated by that agent's own session events, so roster
 * projections never rescan long transcripts on every state push.
 *
 * Parking disposes the AgentSession, so the live stats source disappears while
 * the registry ref survives. The last measured usage is therefore retained per
 * agent (keyed by `createdAt`, so a re-registered id cannot inherit another
 * run's numbers) and served frozen — `lastActivity - createdAt` as a `span` —
 * once the session is gone. Without it a parked agent reports no usage at all
 * and the Hub can only show `usage —`.
 */
function createHarnessAgentTelemetry(registry: AgentRegistryApi): HarnessAgentTelemetryPort {
	const cache = new Map<string, HarnessAgentTelemetryCache>();
	const retained = new Map<string, { createdAt: number; usage: HarnessAgentUsage }>();
	const listeners = new Map<string, Set<() => void>>();
	const attachedSessions = new Map<string, { session: AgentSessionHandle; unsubscribe: () => void }>();

	const notify = (agentId: string): void => {
		cache.delete(agentId);
		for (const listener of listeners.get(agentId) ?? []) {
			try {
				listener();
			} catch {
				// telemetry listeners must not break the session event path
			}
		}
	};

	const attach = (agentId: string): void => {
		const session = registry.get(agentId)?.session ?? null;
		const attached = attachedSessions.get(agentId);
		if (attached && attached.session === session) return;
		attached?.unsubscribe();
		attachedSessions.delete(agentId);
		// The session identity changed (first attach, park, revive): whatever was
		// cached was computed against the previous one.
		if (attached !== undefined || session !== null) cache.delete(agentId);
		if (!session) return;
		const unsubscribe = session.subscribe(() => notify(agentId));
		attachedSessions.set(agentId, { session, unsubscribe });
	};

	const telemetryFor = (agentId: string): HarnessAgentTelemetryCache => {
		const cached = cache.get(agentId);
		if (cached) return cached;
		const result: HarnessAgentTelemetryCache = {};
		const ref = registry.get(agentId);
		const session = ref?.session ?? null;
		if (!ref) retained.delete(agentId);
		if (ref && session) {
			try {
				const stats = session.getSessionStats();
				result.usage = {
					tokens: stats.tokens.total,
					requests: stats.assistantMessages,
					tools: stats.toolCalls,
					cost: stats.cost,
					durationMs: Math.max(0, ref.lastActivity - ref.createdAt),
					durationKind: "active",
					...(stats.contextUsage
						? { contextTokens: stats.contextUsage.tokens, contextWindow: stats.contextUsage.contextWindow }
						: {}),
				};
				retained.set(agentId, { createdAt: ref.createdAt, usage: result.usage });
			} catch {
				// live usage stays unavailable
			}
			const model = session.model?.id;
			if (model !== undefined && model.length > 0) result.model = model;
			try {
				const entries = isAgentViewSession(session) ? session.sessionManager.getEntries() : [];
				for (let index = entries.length - 1; index >= 0; index -= 1) {
					const last = harnessTranscriptMessage(entries[index]!).find(message => message.role === "assistant");
					if (last && last.text.length > 0) {
						result.summary = last.text.slice(0, 200);
						break;
					}
				}
			} catch {
				// latest assistant gist stays unavailable
			}
		} else if (ref) {
			const last = retained.get(agentId);
			if (last && last.createdAt === ref.createdAt) {
				result.usage = {
					...last.usage,
					durationMs: Math.max(0, ref.lastActivity - ref.createdAt),
					durationKind: "span",
				};
			}
		}
		cache.set(agentId, result);
		return result;
	};

	return {
		liveUsage: agentId => telemetryFor(agentId).usage,
		liveModel: agentId => telemetryFor(agentId).model,
		liveSummary: agentId => telemetryFor(agentId).summary,
		refresh: agentId => {
			attach(agentId);
		},
		onChange: (agentId, listener) => {
			attach(agentId);
			let set = listeners.get(agentId);
			if (!set) {
				set = new Set();
				listeners.set(agentId, set);
			}
			set.add(listener);
			const currentSet = set;
			return () => {
				currentSet.delete(listener);
				if (currentSet.size === 0) {
					listeners.delete(agentId);
					attachedSessions.get(agentId)?.unsubscribe();
					attachedSessions.delete(agentId);
					cache.delete(agentId);
				}
			};
		},
	};
}

export function createHarnessHostRuntime(
	session: AgentSession,
	bridgeConfig: HarnessBridgeConfiguration,
	createRuntimeId: () => string = crypto.randomUUID,
	tanCustomTools?: (CustomTool | ToolDefinition)[],
	liveSessionFactory?: HarnessLiveSessionFactory,
	workerLifecycle: {
		residency: () => HarnessWorkerResidency;
		generation: () => number;
		ensureLive: () => Promise<void>;
		onChange: (listener: () => void) => () => void;
	} = {
		residency: () => "active",
		generation: () => 0,
		ensureLive: async () => {},
		onChange: () => () => {},
	},
	resumedFromSessionId?: string,
	mcpManager?: MCPManager,
): HarnessHostRuntime {
	const credentialBroker = createHarnessAuthBroker(session);
	if (cfgGcAutoCompress.get(session.settings))
		void scheduleGcAutoCompress(session.settings.getAgentDir()).catch(error =>
			logger.warn("Harness background compression failed", { error: String(error) }),
		);
	if (!Number.isSafeInteger(bridgeConfig.runtimeEpoch) || (bridgeConfig.runtimeEpoch as number) <= 0) {
		throw new Error("Harness Host Runtime epoch must be a positive safe integer");
	}
	const loop = new HarnessLoopService({
		action: () => cfgLoopMode.get(session.settings),
		isBlocked: () =>
			harnessPauseService.state().paused || session.isStreaming || session.isCompacting || session.hasPostPromptWork,
		isVibeActive: () => session.getVibeModeState()?.enabled === true || modes.vibeTransitionPending,
		submitPrompt: async prompt => {
			await session.prompt(prompt);
		},
		compact: async () => {
			await session.compact();
		},
		reset: async () => {
			await session.resetSessionContext();
		},
		nowMs: Date.now,
		setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
		clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
		evaluateCondition: (condition, signal) =>
			evaluateLoopCondition(condition, {
				cwd: session.sessionManager.getCwd(),
				sessionId: session.sessionManager.getSessionId(),
				timeoutMs: cfgLoopConditionTimeoutMs.get(session.settings),
				signal,
			}),
		onStatus: message => session.emitNotice("info", message, "loop"),
		onError: error => session.emitNotice("error", error instanceof Error ? error.message : String(error), "loop"),
	});
	const unsubscribeLoopPause = harnessPauseService.onChange(() => loop.interruptPending());
	const liveAudio = new HarnessLiveAudioService(session);
	const live = new HarnessLiveService(liveSessionFactory ?? liveAudio.factory);
	liveAudio.bindControl(live);
	const modes = new HarnessModeControlService(session);
	const extensionModes = new HarnessExtensionModes(session, modes, loop);
	const models = new HarnessModelControlService(session);
	const workbench = new HarnessWorkbenchService(
		session,
		liveAudio,
		mcpManager,
		() => bridgeConfig.runtimeEpoch as number,
	);
	workbench.planControl = modes;
	const permissions = new HarnessPermissionControlService(session);
	const settings = new HarnessRuntimeSettingsService(session);
	const prediction = workbench.prediction;
	const timeTravel = new HarnessTimeTravelBoundary(session, bridgeConfig.runtimeEpoch as number);
	session.setBeforeNextUserTurn(async () => {
		await workbench.worktrees.ensureStartResolved();
		await models.applyPending();
		await modes.applyPending();
		await permissions.applyPending();
		attachQueueCapture();
		await timeTravel.capture("before");
	});
	session.setAfterUserTurn?.(() => timeTravel.capture("after"));
	const interaction = new HarnessInteractionGateway((message, level) =>
		session.emitNotice(level, message, "extension"),
	);
	const idleMaintenance = new HarnessIdleMaintenance(
		session,
		loop,
		interaction,
		() => workerLifecycle.residency() === "active",
	);
	workbench.views.formReader = (id, generation) => interaction.readForm(id, generation);
	workbench.modelAuth.interaction = interaction;
	workbench.worktrees.interaction = interaction;
	workbench.runtimeFeatures.mcpAuth.interaction = interaction;
	modes.interaction = interaction;
	const cfg = new HarnessCfgService(session, interaction);
	session.setResetConsentHandler?.(async ({ provider, message, settingKeys }) => {
		const choice = await interaction.select({
			commandId: `reset-consent:${provider}:${crypto.randomUUID()}`,
			title: message,
			options: [
				{
					id: "Yes",
					label: runtimeText("本次兑换并记住此窗口", "Redeem this time and remember for this window"),
					description: runtimeText(
						`只将本次适用的 ${settingKeys.join(", ")} 设为允许，不批准其他窗口。`,
						`Allow ${settingKeys.join(", ")} for this window only without approving other windows.`,
					),
				},
				{
					id: "No",
					label: runtimeText(
						"保留重置并关闭此窗口自动兑换",
						"Keep resets and disable auto-redeem for this window",
					),
					description: runtimeText(
						`只将 ${settingKeys.join(", ")} 设为不允许；其他窗口保持原策略。`,
						`Disallow ${settingKeys.join(", ")} for this window only; keep the existing policy for other windows.`,
					),
				},
			],
		});
		return choice === "Yes" || choice === "No" ? choice : undefined;
	});
	const tree = new HarnessTreeService(session, interaction);
	const fork = new HarnessForkService(session);
	const handoff = new HarnessHandoffService(session);
	const fastPrewalk = new HarnessFastPrewalkService(session);
	const commands = new HarnessCommandManifestService(session, (args, signal) =>
		workbench.commit.prepareFromArgs(args, signal),
	);
	const btw = new HarnessBtwService(session, {
		injectEnabled: () => cfgBtwInject.get(session.settings),
		sendInjection: (text, sessionId) => sendHarnessBtwInjection(session, text, sessionId),
	});
	workbench.runtimeFeatures.injectBtw = id => btw.inject(id);
	let pendingRuleWrite: { filePath: string; previous: Uint8Array | undefined; existed: boolean } | undefined;
	const clearPendingRuleWrite = () => {
		pendingRuleWrite = undefined;
	};
	const omfg = new HarnessOmfgService(
		{
			runEphemeralTurn: args => session.runEphemeralTurn(args),
			getMessages: () => session.messages,
			getTools: () => session.agent.state.tools,
			getCwd: () => session.sessionManager.getCwd(),
			ruleJudge: () => session.ruleJudge(),
		},
		{
			resolveRulePath: (scope, ruleName) =>
				path.join(
					scope === "user" ? session.settings.getAgentDir() : session.sessionManager.getCwd(),
					...(scope === "user" ? [] : [CONFIG_DIR_NAME]),
					"rules",
					`${ruleName}.md`,
				),
			exists: async filePath => await Bun.file(filePath).exists(),
			write: async (filePath, content) => {
				await Bun.write(filePath, content);
			},
			writeAtomic: async (filePath, content) => {
				await fs.mkdir(path.dirname(filePath), { recursive: true });
				const existing = Bun.file(filePath);
				const existed = await existing.exists();
				const previous = existed ? new Uint8Array(await existing.arrayBuffer()) : undefined;
				const temporary = path.join(
					path.dirname(filePath),
					`.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
				);
				try {
					await Bun.write(temporary, content);
					await fs.rename(temporary, filePath);
					pendingRuleWrite = { filePath, previous, existed };
				} finally {
					await fs.rm(temporary, { force: true }).catch(() => {});
				}
			},
		},
		{
			register: rule => session.ttsrManager?.addRule(rule) ?? false,
		},
		interaction,
		{
			rollback: async filePath => {
				if (pendingRuleWrite?.filePath !== filePath) return;
				if (pendingRuleWrite.existed && pendingRuleWrite.previous !== undefined) {
					await Bun.write(filePath, pendingRuleWrite.previous);
				} else {
					await fs.rm(filePath, { force: true });
				}
				clearPendingRuleWrite();
			},
			finalize: clearPendingRuleWrite,
		},
	);
	const registry = AgentRegistry.global();
	const lifecycle = AgentLifecycleManager.global();
	const irc = IrcBus.global();
	const tan = new HarnessTanService({
		parent: {
			get sessionId() {
				return session.sessionId;
			},
			get promptCacheKey() {
				return session.agent.promptCacheKey ?? session.sessionId;
			},
			get ownerId() {
				return session.getAgentId() ?? MAIN_AGENT_ID;
			},
			get isStreaming() {
				return session.isStreaming;
			},
			get model() {
				return session.model;
			},
			get modelRegistry() {
				return session.modelRegistry;
			},
			get authStorage() {
				return session.modelRegistry.authStorage;
			},
			get systemPrompt() {
				return [...session.systemPrompt];
			},
			get toolNames() {
				return session.getActiveToolNames();
			},
			get thinkingLevel() {
				return session.configuredThinkingLevel() ?? "auto";
			},
			settings: session.settings,
			get enableLsp() {
				return cfgTaskEnableLsp.get(session.settings) !== false;
			},
			customTools: tanCustomTools,
			get parentFile() {
				return session.sessionManager.getSessionFile() ?? undefined;
			},
			get cwd() {
				return session.sessionManager.getCwd();
			},
			get sessionDir() {
				const parentFile = session.sessionManager.getSessionFile();
				return parentFile ? parentFile.slice(0, -6) : session.sessionManager.getCwd();
			},
			get artifactsDir() {
				return session.sessionManager.getArtifactsDir();
			},
			get parentLocalSessionId() {
				return session.sessionManager.getSessionId();
			},
		},
		fork: async input => {
			await session.sessionManager.ensureOnDisk();
			await session.sessionManager.flush();
			return await NativeSessionManager.forkFrom(input.parentFile, input.cwd, input.sessionDir, undefined, {
				suppressBreadcrumb: true,
				sessionFile: input.cloneFile,
			});
		},
		createAgent: async options => {
			const created = await sdk.createAgentSession(options);
			return { session: created.session, sessionFile: created.session.sessionManager.getSessionFile() ?? null };
		},
		adopt: input => {
			const current = registry.get(input.agentId);
			if (current?.session === input.session) return true;
			if (current !== undefined) return false;
			registry.register({
				id: input.agentId,
				displayName: input.displayName,
				kind: "sub",
				parentId: input.parentId,
				session: input.session,
				sessionFile: input.sessionFile,
				status: "running",
			});
			return true;
		},
		jobManager: {
			register: (type, label, run, options) => {
				const manager = session.asyncJobManager;
				if (!manager) throw new HarnessTanError("COMMAND_BLOCKED", "Background jobs are disabled");
				return manager.register(type, label, run, options);
			},
		},
		registry,
		deliver: async ({ jobId, work }) => {
			await session.sendCustomMessage(
				{
					customType: BACKGROUND_TAN_DISPATCH_MESSAGE_TYPE,
					content: prompt.render(backgroundTanDispatchPrompt, { jobId, work }),
					display: true,
					attribution: "user",
					details: { jobId, work },
				},
				{ triggerTurn: false, deliverAs: "nextTurn" },
			);
		},
		cleanup: {
			cancelJob: jobId => {
				session.asyncJobManager?.cancel(jobId, { ownerId: session.getAgentId() ?? MAIN_AGENT_ID });
			},
			unregisterAgent: agentId => {
				registry.unregister(agentId);
			},
			disposeSession: async child => {
				await child.dispose();
			},
			removeCloneFiles: async cloneFile => {
				await Promise.allSettled([
					fs.rm(cloneFile, { force: true }),
					fs.rm(cloneFile.slice(0, -6), { recursive: true, force: true }),
				]);
			},
		},
	});
	const toolSession = harnessToolSession(session);
	// The main Worker can be disposed and recreated while Runtime services stay
	// resident. Resolve the manager through the SessionSlot on every call so
	// jobs created after revival do not remain attached to the terminal manager
	// owned by the previous AgentSession.
	const jobsPort: HarnessJobsPort = {
		getJob: id => session.asyncJobManager?.getJob(id),
		getRunningJobs: filter => session.asyncJobManager?.getRunningJobs(filter) ?? [],
		getRecentJobs: (limit, filter) => session.asyncJobManager?.getRecentJobs(limit, filter) ?? [],
		getAllJobs: filter => session.asyncJobManager?.getAllJobs(filter) ?? [],
		cancel: (id, filter) => session.asyncJobManager?.cancel(id, filter) ?? false,
		widgetView: job => session.asyncJobManager?.widgets?.peek?.(job),
		widgetCaption: job => session.asyncJobManager?.widgets?.caption(job),
	};
	const agentsRef = { current: undefined as HarnessAgentHubService | undefined };
	const jobs = new HarnessJobService(jobsPort, registry, {
		confirmationGate: async action =>
			await interaction.confirm({
				commandId: `job.cancel:${action.jobId}`,
				title: "Cancel background job?",
				message: `Cancel job ${action.jobId}?`,
				destructive: true,
			}),
		abortAgent: {
			abortAgent: async agentId => {
				const currentAgents = agentsRef.current;
				if (currentAgents === undefined) return;
				let snapshot: ReturnType<HarnessAgentHubService["get"]>;
				try {
					snapshot = currentAgents.get(agentId);
				} catch {
					return;
				}
				await currentAgents.kill({
					agentId,
					expectedGeneration: snapshot.generation,
					callerAgentId: session.getAgentId() ?? MAIN_AGENT_ID,
				});
			},
		},
	});
	const agents = new HarnessAgentHubService(
		registry,
		lifecycle,
		irc,
		{
			spawn: async request => {
				const settings = session.settings.overlay();
				// This GUI action is one native task; the schema override is local to
				// this invocation, never a change to the model's advertised task policy.
				cfgTaskBatch.override(settings, false);
				cfgTaskSteps.override(settings, request.steps !== undefined);
				if (request.async !== undefined) cfgAsyncEnabled.override(settings, request.async);
				if (request.isolation !== undefined)
					cfgTaskIsolationMerge.override(settings, request.isolation as "patch" | "branch");
				const spawningSession = new Proxy(toolSession, {
					get(target, property) {
						return property === "settings" ? settings : Reflect.get(target, property, target);
					},
				});
				const task = await TaskTool.create(spawningSession);
				const parameters = {
					agent: request.definition,
					...(request.steps ? { steps: request.steps } : { task: request.assignment }),
					solutionSpace: request.solutionSpace ?? request.assignment ?? request.steps?.join("\n"),
					...(request.model ? { model: request.model[0] } : {}),
					...(request.context === undefined ? {} : { context: request.context }),
					...(request.effort === undefined ? {} : { effort: request.effort as TaskEffort }),
					...(request.isolation === undefined ? {} : { isolated: true }),
				};
				const toolCallId = crypto.randomUUID();
				const result = await task.execute(toolCallId, parameters);
				const first = result.details?.progress?.[0] ?? result.details?.results?.[0];
				if (!first?.id)
					throw new Error(
						result.content
							.filter(item => item.type === "text")
							.map(item => item.text)
							.join("\n") || "Task spawn did not return an agent identity",
					);
				return {
					agentId: first.id,
					...(result.details?.async?.jobId === undefined ? {} : { jobId: result.details.async.jobId }),
				};
			},
		},
		{
			read: async ({ agentId, offset, limit }) => {
				const ref = registry.get(agentId);
				if (!ref) throw new Error("Unknown agent");
				const entries =
					ref.session && isAgentViewSession(ref.session)
						? [...ref.session.sessionManager.getBranch()]
						: ref.sessionFile
							? (reconstructSessionBranch(await loadEntriesFromFile(ref.sessionFile))?.branch ?? [])
							: [];
				const messages = entries.flatMap(entry => harnessTranscriptMessage(entry));
				return { messages: messages.slice(offset, offset + limit), eof: offset + limit >= messages.length };
			},
		},
		{
			confirmationGate: async action =>
				await interaction.confirm({
					commandId: `agent.${action.kind}:${action.agentId}`,
					title: "Release agent?",
					message: `Release agent ${action.agentId}?`,
					destructive: true,
				}),
			activeJobIdsFor: agentId =>
				jobsPort
					.getAllJobs()
					.filter(job => job.agentId === agentId && job.status === "running")
					.map(job => job.id),
			taskProgressFor: agentId => {
				const job = jobsPort
					.getAllJobs()
					.filter(candidate => candidate.type === "task" && candidate.agentId === agentId)
					.sort((a, b) => b.startTime - a.startTime)[0];
				return job === undefined ? undefined : taskJobProgress(job);
			},
			telemetry: createHarnessAgentTelemetry(registry),
		},
	);
	agentsRef.current = agents;
	const transcript = new HarnessSessionTranscriptService(() => ({
		runtimeEpoch: bridgeConfig.runtimeEpoch as number,
		sessionId: session.sessionManager.getSessionId(),
		sessionManager: session.sessionManager,
		toolResult: toolCallId => mainConversation.toolResult(session.sessionManager.getSessionId(), toolCallId),
	}));
	const createConversationProjector = (target: AgentViewSession, runtimeEpoch: number): ConversationLiveProjector => {
		const currentTarget = (): AgentViewSession => {
			if ("current" in target && typeof target.current === "function") {
				return target.current();
			}
			return target;
		};
		const localManager = (): SessionManager | undefined => {
			const resolved = currentTarget();
			return isLocalAgentSession(resolved) ? resolved.sessionManager : undefined;
		};
		const projector = new ConversationLiveProjector({
			restoreModelMentions: text =>
				text.includes("<model ")
					? expandModelMentionTags(
							text,
							agent =>
								readModelMentions(target.sessionManager.getBranch()).find(mention => mention.agent === agent)
									?.selector,
						)
					: text,
			sessionId: target.sessionManager.getSessionId(),
			runtimeEpoch,
			reserveMessageId: input => localManager()?.reserveMessageId(input.role) ?? crypto.randomUUID().slice(-8),
			reserveCustomMessageId: input =>
				localManager()?.reserveCustomMessageId(input.customType, input.timestamp) ?? crypto.randomUUID().slice(-8),
			reserveCompactionId: () => localManager()?.reserveCompactionId() ?? crypto.randomUUID().slice(-8),
			releaseCompactionId: id => {
				localManager()?.releaseCompactionId(id);
			},
			lookupPersistedCompactionId: ({ summary }) => {
				const manager = target.sessionManager;
				if (typeof manager.getBranch !== "function") return undefined;
				const branch = manager.getBranch();
				for (let index = branch.length - 1; index >= 0; index--) {
					const entry = branch[index];
					if (entry.type === "compaction" && entry.summary === summary) return entry.id;
				}
				return undefined;
			},
		});
		projector.bind(target);
		return projector;
	};
	const mainConversation = createConversationProjector(session, bridgeConfig.runtimeEpoch as number);
	const conversation = new ConversationProjectorHub({
		main: mainConversation,
		registry,
		runtimeEpoch: () => bridgeConfig.runtimeEpoch as number,
		createChild: ref =>
			ref.session === null || !isAgentViewSession(ref.session)
				? undefined
				: createConversationProjector(ref.session, bridgeConfig.runtimeEpoch as number),
	});
	const agentConversation = new HarnessAgentConversationService({
		registry,
		toolResult: sessionId => toolCallId => conversation.toolResult(sessionId, toolCallId),
		runtimeEpoch: () => bridgeConfig.runtimeEpoch as number,
	});
	const shutdownSignal = Promise.withResolvers<void>();
	const performanceSampler = createRuntimePerformanceSampler({
		counters: () => ({
			...conversation.getDiagnostics(),
			workerResidency: ["active", "sleeping", "recycling", "reviving", "dormant", "failed"].indexOf(
				workerLifecycle.residency(),
			),
			workerGeneration: workerLifecycle.generation(),
		}),
		// Dedicated numerical diagnostic sink; never used to infer business state.
		emit: line => {
			process.stderr.write(`[harness.performance] ${line}\n`);
		},
	});
	performanceSampler.start();
	let shutdownRequested = false;
	let disposed = false;
	let loopSessionId = session.sessionManager.getSessionId();
	let unsubscribeQueueCapture = () => {};
	const attachQueueCapture = () => {
		unsubscribeQueueCapture();
		const agent = session.agent;
		unsubscribeQueueCapture =
			agent?.addBeforeQueuedMessageDequeueHook?.(async () => {
				const queued = [...agent.peekSteeringQueue(), ...agent.peekFollowUpQueue()];
				if (!queued.some(message => message.role === "user")) return;
				await timeTravel.capture("before");
			}) ?? (() => {});
	};
	attachQueueCapture();
	const unsubscribeSessionChange =
		typeof session.registerSessionChangeCallback === "function"
			? session.registerSessionChangeCallback(() => {
					attachQueueCapture();
					const nextSessionId = session.sessionManager.getSessionId();
					if (nextSessionId !== loopSessionId) {
						loopSessionId = nextSessionId;
						if (loop.state() !== undefined) loop.disable();
					}
					if (typeof session.sessionManager.clearReservedMessageIds === "function") {
						session.sessionManager.clearReservedMessageIds();
					}
					mainConversation.rebind(session, {
						sessionId: session.sessionManager.getSessionId(),
						runtimeEpoch: bridgeConfig.runtimeEpoch as number,
					});
					void hydratePersistedHarnessAgents(registry, sessionFileOf(session), () => !disposed);
				})
			: () => {};
	let boundWorkerGeneration = workerLifecycle.generation();
	const unsubscribeWorkerRevive = workerLifecycle.onChange(() => {
		if (workerLifecycle.residency() !== "active") return;
		const nextGeneration = workerLifecycle.generation();
		if (nextGeneration === boundWorkerGeneration) return;
		boundWorkerGeneration = nextGeneration;
		attachQueueCapture();
		if (typeof session.sessionManager.clearReservedMessageIds === "function") {
			session.sessionManager.clearReservedMessageIds();
		}
		mainConversation.rebind(session, {
			sessionId: session.sessionManager.getSessionId(),
			runtimeEpoch: bridgeConfig.runtimeEpoch as number,
		});
	});
	const unsubscribe = session.subscribe(event => {
		if (event.type === "agent_end") {
			loop.scheduleNext();
		}
	});
	return Object.freeze({
		runtimeId: createRuntimeId(),
		...(resumedFromSessionId ? { resumedFromSessionId } : {}),
		runtimeEpoch: bridgeConfig.runtimeEpoch as number,
		get sessionId() {
			return session.sessionManager.getSessionId();
		},
		session,
		get sessionManager() {
			return session.sessionManager;
		},
		workerResidency: workerLifecycle.residency,
		workerGeneration: workerLifecycle.generation,
		ensureWorkerLive: workerLifecycle.ensureLive,
		onWorkerStateChange: workerLifecycle.onChange,
		services: Object.freeze({
			pause: harnessPauseService,
			loop,
			live,
			modes,
			extensionModes,
			idleMaintenance,
			models,
			permissions,
			settings,
			prediction,
			cfg,
			tree,
			fork,
			handoff,
			fastPrewalk,
			commands,
			btw,
			upgrade: new HarnessUpgradeService(session, btw),
			workbench,
			interaction,
			omfg,
			tan,
			agents,
			jobs,
			evaluation: new HarnessEvaluationService({
				owner: () => session.getAgentId() ?? MAIN_AGENT_ID,
				jobs,
				prelude: (name, parameters, signal) =>
					invokeEvalPrelude(name, parameters, {
						session: toolSession,
						toolCallId: crypto.randomUUID(),
						signal,
						context: toolSession.getToolContext?.(),
					}),
				read: async (path, signal) => {
					const result = await callSessionTool("read", { path }, { session: toolSession, signal });
					if (typeof result !== "object" || result === null || !("text" in result)) return result;
					return {
						content: [
							{ type: "text", text: result.text },
							...("images" in result ? (result.images ?? []) : []).map(image => ({ type: "image", ...image })),
						],
						...("details" in result ? { details: result.details } : {}),
					};
				},
				agent: (args, signal) => runEvalAgent(args, { session: toolSession, signal }),
				completion: (args, signal) => runEvalCompletion(args, { session: toolSession, signal }),
				completionIdentity: id => {
					const handle = getCompletionHandle(id);
					return handle?.ownerId === (session.getAgentId() ?? MAIN_AGENT_ID) ? handle : undefined;
				},
				status: async (kind, id, signal) => runEvalStatus({ item: { kind, id } }, { session: toolSession, signal }),
				wait: (kind, id, timeoutMs, signal) =>
					runEvalWait({ items: [{ kind, id }], timeoutMs }, { session: toolSession, signal }),
				cancelCompletion: async (id, signal) =>
					runEvalCancel({ item: { kind: "completion", id } }, { session: toolSession, signal }),
				pool: (name, signal) => runEvalWorkpool({ op: "status", name }, { session: toolSession, signal }),
			}),
			transcript,
			agentConversation,
			conversation,
			timeTravel,
		}),
		bridgeConfig: Object.freeze({ ...bridgeConfig }),
		waitForShutdown: () => shutdownSignal.promise,
		requestShutdown: () => {
			if (shutdownRequested) return;
			shutdownRequested = true;
			shutdownSignal.resolve();
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			credentialBroker.close();
			performanceSampler.dispose();
			unsubscribeQueueCapture();
			timeTravel.dispose();
			session.setBeforeNextUserTurn(undefined);
			session.setAfterUserTurn?.(undefined);
			session.setResetConsentHandler?.(undefined);
			cfg.dispose();
			unsubscribe();
			unsubscribeSessionChange();
			unsubscribeWorkerRevive();
			unsubscribeLoopPause();
			conversation.dispose();
			if (typeof session.sessionManager.clearReservedMessageIds === "function") {
				session.sessionManager.clearReservedMessageIds();
			}
			loop.dispose();
			live.dispose();
			workbench.dispose();
			idleMaintenance.dispose();
			extensionModes.dispose();
			modes.dispose();
			btw.dispose();
			agents.dispose();
			agentConversation.dispose();
		},
	});
}

interface HarnessMainWorkerSupervisor {
	readonly residency: () => HarnessWorkerResidency;
	readonly generation: () => number;
	readonly ensureLive: () => Promise<void>;
	readonly onChange: (listener: () => void) => () => void;
	dispose(): Promise<void>;
}

async function initializeHarnessExtensions(session: AgentSession, runtime: HarnessHostRuntime): Promise<void> {
	const uiContext = createDefaultToolUiContext(session.sessionId);
	await initializeExtensions(session, {
		mode: "rpc",
		...(uiContext ? { uiContext } : {}),
		onShutdown: () => runtime.requestShutdown(),
		reportSendError: (action, error) => logger.warn("Harness extension send failed", { action, error: error.message }),
		reportRuntimeError: error => logger.warn("Harness extension runtime failed", { error }),
	});
}

function createHarnessMainWorkerSupervisor(
	slot: HarnessSessionSlot,
	runtime: HarnessHostRuntime,
	options: Pick<
		HarnessHostModeDependencies,
		"recreateSession" | "workerIdleSleepMs" | "workerIdleRecycleMs" | "nowMs" | "setToolUIContext"
	>,
): HarnessMainWorkerSupervisor {
	const sleepMs = options.workerIdleSleepMs ?? 3 * 60_000;
	const recycleMs = options.workerIdleRecycleMs ?? 5 * 60_000;
	const now = options.nowMs ?? Date.now;
	if (!Number.isSafeInteger(sleepMs) || sleepMs <= 0)
		throw new TypeError("workerIdleSleepMs must be a positive integer");
	if (!Number.isSafeInteger(recycleMs) || recycleMs <= sleepMs) {
		throw new TypeError("workerIdleRecycleMs must be greater than workerIdleSleepMs");
	}
	let state: HarnessWorkerResidency = "active";
	let generation = 0;
	let idleSince = now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let queue: Promise<unknown> = Promise.resolve();
	let revival: Promise<void> | undefined;
	const listeners = new Set<() => void>();

	const emit = (next: HarnessWorkerResidency): void => {
		if (state === next) return;
		state = next;
		for (const listener of [...listeners]) {
			try {
				listener();
			} catch {
				// Worker lifecycle observers must never affect Runtime control flow.
			}
		}
	};

	const blocked = (): boolean => {
		if (
			runtime.services.workbench.liveAudio.running ||
			["connecting", "active", "stopping"].includes(runtime.services.live.state().status)
		)
			return true;
		if (runtime.services.idleMaintenance.keepWorkerLive()) return true;
		if (runtime.services.workbench.skillshare.running || runtime.services.workbench.modelAuth.isBusy()) return true;
		if (
			runtime.services.workbench.ida.running ||
			runtime.services.workbench.agentBtw.running ||
			runtime.services.workbench.benchmarks.running ||
			runtime.services.workbench.evaluations.running ||
			runtime.services.workbench.media.running ||
			runtime.services.workbench.prediction.running ||
			runtime.services.workbench.portability.running ||
			runtime.services.workbench.compression.running ||
			runtime.services.workbench.worktrees.running
		)
			return true;
		if (
			slot.isStreaming ||
			slot.isCompacting ||
			slot.hasPostPromptWork ||
			slot.queuedMessageCount > 0 ||
			slot.hasHeldQueuedMessages
		)
			return true;
		if (runtime.services.interaction.pending() !== undefined) return true;
		return runtime.services.jobs
			.list({
				callerAgentId: slot.getAgentId?.() ?? MAIN_AGENT_ID,
				includeRecent: false,
			})
			.some(job => (job as { status?: string }).status === "running");
	};

	const arm = (): void => {
		if (disposed) return;
		if (timer !== undefined) clearTimeout(timer);
		const elapsed = now() - idleSince;
		const delay = state === "sleeping" ? Math.max(1, recycleMs - elapsed) : Math.max(1, sleepMs - elapsed);
		timer = setTimeout(() => {
			timer = undefined;
			void serialized(async () => {
				if (disposed || blocked()) {
					idleSince = now();
					if (state !== "active") emit("active");
					arm();
					return;
				}
				const elapsedNow = now() - idleSince;
				if (state === "active" && elapsedNow < sleepMs) {
					arm();
					return;
				}
				if (state === "active") {
					emit("sleeping");
					arm();
					return;
				}
				if (elapsedNow < recycleMs) {
					arm();
					return;
				}
				await recycle();
			}).catch(error => {
				emit("failed");
				logger.warn("Harness main Worker recycle failed", { error: String(error) });
			});
		}, delay);
		timer.unref?.();
	};

	const touch = (): void => {
		idleSince = now();
		if (state === "sleeping") emit("active");
		arm();
	};

	const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
		const run = queue.then(operation, operation);
		queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	const recycle = async (): Promise<void> => {
		if (blocked()) {
			touch();
			return;
		}
		emit("recycling");
		try {
			await slot.sessionManager.ensureOnDisk();
			await slot.sessionManager.flush();
			await slot.disposeCurrent();
			generation += 1;
			emit("dormant");
		} catch (error) {
			emit("failed");
			throw error;
		}
	};

	const revive = async (): Promise<void> => {
		if (state === "active") {
			touch();
			return;
		}
		if (revival !== undefined) return await revival;
		const recreateSession = options.recreateSession;
		if (recreateSession === undefined) {
			emit("failed");
			throw new HarnessRuntimeCommandError(
				"COMMAND_BLOCKED",
				"Main Worker cannot be revived without a session factory",
			);
		}
		const sessionFile = slot.sessionManager.getSessionFile();
		if (sessionFile === undefined || sessionFile.length === 0) {
			emit("failed");
			throw new HarnessRuntimeCommandError("COMMAND_BLOCKED", "Main Worker has no persisted session file to revive");
		}
		revival = serialized(async () => {
			emit("reviving");
			let next: AgentSession | undefined;
			let replaced = false;
			try {
				next = await recreateSession(sessionFile);
				slot.replace(next);
				replaced = true;
				options.setToolUIContext?.(createHarnessRemoteUiFactory(runtime.services.interaction), true);
				setHarnessThreadInteraction(runtime.services.interaction);
				if (!(process.stdin.isTTY && process.stdout.isTTY)) await initializeHarnessExtensions(next, runtime);
				runtime.services.modes.rebindSettings();
				runtime.services.extensionModes.rebind();
				runtime.services.idleMaintenance.rebind();
				runtime.services.workbench.prediction.enableMessagePrediction(next);
				runtime.services.cfg?.rebind();
				generation += 1;
				idleSince = now();
				emit("active");
				arm();
			} catch (error) {
				if (replaced) {
					await slot.disposeCurrent().catch(() => undefined);
				} else if (next !== undefined) {
					await next.dispose?.().catch(() => undefined);
				}
				emit("failed");
				throw error;
			} finally {
				revival = undefined;
			}
		});
		return await revival;
	};

	const unsubscribe = slot.subscribe(() => touch());
	arm();
	return {
		residency: () => state,
		generation: () => generation,
		ensureLive: async () => {
			if (disposed) throw new HarnessRuntimeCommandError("COMMAND_BLOCKED", "Runtime Worker is disposed");
			if (state === "active") {
				touch();
				return;
			}
			await revive();
		},
		onChange: listener => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: async () => {
			if (disposed) return;
			disposed = true;
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			unsubscribe();
			await queue.catch(() => undefined);
			await slot.disposeCurrent();
			listeners.clear();
		},
	};
}

export async function runHarnessHostMode(
	session: AgentSession,
	bridgeConfig: HarnessBridgeConfiguration,
	runTui: HarnessHostTuiRunner,
	dependencies: HarnessHostModeDependencies = {},
): Promise<void> {
	const bridge = dependencies.createBridge?.() ?? createConfiguredBridge(bridgeConfig);
	const slot =
		dependencies.recreateSession === undefined ? (session as HarnessSessionSlot) : createSessionSlot(session);
	const supervisorRef = { current: undefined as HarnessMainWorkerSupervisor | undefined };
	const runtime = createHarnessHostRuntime(
		slot,
		bridgeConfig,
		dependencies.createRuntimeId,
		dependencies.tanCustomTools,
		dependencies.liveSessionFactory,
		{
			residency: () => supervisorRef.current?.residency() ?? "active",
			generation: () => supervisorRef.current?.generation() ?? 0,
			ensureLive: async () => await supervisorRef.current?.ensureLive(),
			onChange: listener => supervisorRef.current?.onChange(listener) ?? (() => {}),
		},
		dependencies.resumedFromSessionId,
		dependencies.mcpManager,
	);
	const supervisor: HarnessMainWorkerSupervisor =
		dependencies.recreateSession === undefined
			? {
					residency: () => "active",
					generation: () => 0,
					ensureLive: async () => {},
					onChange: () => () => {},
					dispose: async () => {},
				}
			: createHarnessMainWorkerSupervisor(slot, runtime, dependencies);
	supervisorRef.current = supervisor;
	const unregisterCleanup = postmortem.register(`harness-host-bridge:${runtime.runtimeId}`, () => bridge.stop());
	const stopParentWatch = (dependencies.watchParent ?? watchHarnessParentFromEnv)(() =>
		abortForHostLoss(runtime, dependencies.hostLossExit),
	);

	try {
		await hydratePersistedHarnessAgents(AgentRegistry.global(), sessionFileOf(slot));
		await runtime.services.commands.refresh();
		// A headless Harness worker has no InteractiveMode to apply this default.
		// Revivals, resumes, handoffs and sessions with an explicit mode keep their state.
		if (
			dependencies.freshSession &&
			!(process.stdin.isTTY && process.stdout.isTTY) &&
			cfgPlanEnabled.get(slot.settings) &&
			cfgPlanDefaultOnStartup.get(slot.settings) &&
			slot.sessionManager.buildSessionContext().messages.length === 0 &&
			!slot.sessionManager.getEntries().some(entry => entry.type === "mode_change")
		) {
			await runtime.services.modes.enterPlan();
		}
		// The Host owns this identity once the Bridge is ready. Materialize even
		// an empty session so a restart can --resume it before the first message.
		await slot.sessionManager.ensureOnDisk();
		await bridge.start(runtime);
		// Install the Remote UI factory so Ask / tool dialogs surface as
		// interaction cards on the Bridge (plan §2.5). The interactive TUI
		// branch (TTY) replaces it with its own UIContext when it starts.
		dependencies.setToolUIContext?.(createHarnessRemoteUiFactory(runtime.services.interaction), true);
		setHarnessThreadInteraction(runtime.services.interaction);
		if (!(process.stdin.isTTY && process.stdout.isTTY)) await initializeHarnessExtensions(session, runtime);
		await runTui(runtime);
	} finally {
		stopParentWatch();
		runtime.services.cfg?.dispose();
		unregisterCleanup();
		try {
			await bridge.stop();
		} finally {
			// Invalidate the factory so late tool contexts fail closed instead
			// of opening interactions on a dead bridge.
			dependencies.setToolUIContext?.(undefined, false);
			setHarnessThreadInteraction(undefined);
			await supervisor.dispose();
			runtime.dispose();
		}
	}
}
import { HarnessPredictionService } from "./services/prediction-service";

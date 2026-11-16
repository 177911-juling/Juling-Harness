import { HarnessSearchCredentialsService } from "./search-credentials-service";
import { HarnessQueuedCompactionService } from "./queued-compaction-service";
import { HarnessRuntimeViews } from "./runtime-view-service";
import type { MCPManager } from "../../mcp/manager";
import { HarnessEvaluationWorkspaceService } from "./evaluation-workspace-service";
import { isEvaluationWorkspaceKind, type EvaluationWorkspaceOperation } from "../evaluation-workspace-protocol";
import { HarnessAdvisorConfigService } from "./advisor-config-service";
import { isAdvisorConfigKind, type AdvisorConfigOperation } from "../advisor-config-protocol";
import { isLocalResourceKind, type LocalResourceOperation } from "../local-resources-protocol";
import { isDictationKind, type DictationOperation } from "../dictation-protocol";
import { HarnessContextViewService } from "./context-view-service";
import type { HarnessModeControlService } from "./mode-control-service";
import { isNativePlanReviewKind, type NativePlanReviewOperation } from "../plan-review-protocol";
import { HarnessSessionWorktreesService } from "./session-worktrees-service";
import { isSessionWorktreeKind, type SessionWorktreeOperation } from "../session-worktrees-protocol";
import { HarnessSessionCompressionService } from "./session-compression-service";
import { isSessionCompressionKind, type SessionCompressionOperation } from "../session-compression-protocol";
import { HarnessSessionPortabilityService } from "./session-portability-service";
import { isSessionPortabilityKind, type SessionPortabilityOperation } from "../session-portability-protocol";
import { HarnessFeatureSettingsService } from "./feature-settings-service";
import { isFeatureSettingsKind, type FeatureSettingsOperation } from "../feature-settings-protocol";
import { HarnessIdaDetailsService } from "./ida-details-service";
import { HarnessSessionTitlesService } from "./session-titles-service";
import { isSessionTitlesKind, type SessionTitlesOperation } from "../session-titles-protocol";
import { HarnessPredictionService } from "./prediction-service";
import { isPredictionKind, type PredictionChannelOperation } from "../prediction-channel-protocol";
import { HarnessMaintenanceService } from "./maintenance-service";
import { isMaintenanceKind, type MaintenanceOperation } from "../maintenance-protocol";
import { HarnessArchiveService } from "./archive-service";
import { isArchiveOperationKind, type ArchiveOperation } from "../archive-protocol";
import { HarnessAgentModelService } from "./agent-model-service";
import type { Model } from "@oh-my-pi/pi-ai";
import type { RuntimeModelChoice } from "../workbench-protocol";
import { HarnessSessionRestoreService } from "./session-restore-service";
import { HarnessRuntimeQueueService } from "./runtime-queue-service";
import { isRuntimeQueueKind, type RuntimeQueueOperation } from "../runtime-queue-protocol";
import { HarnessNativePreferencesService } from "./native-preferences-service";
import { isNativePreferenceKind, type NativePreferenceOperation } from "../native-preferences-protocol";
import { HarnessRatchetService } from "./ratchet-service";
import { isRatchetKind, type RatchetOperation } from "../ratchet-protocol";
import { cfgLaunchEnabled } from "../../tools/settings";
import { HarnessSessionGuiService } from "./session-gui-service";
import { HarnessAgentBtwService } from "./agent-btw-service";
import { HarnessIdaService } from "./ida-service";
import { HarnessResourceService } from "./resource-service";
import { HarnessSkillshareService } from "./skillshare-service";
import { HarnessLiveAudioService } from "./live-audio-service";
import { HarnessMediaService } from "./media-service";
import { HarnessBenchmarkService } from "./benchmark-service";
import { HarnessRuntimeCatalogService } from "./runtime-catalog-service";
import { HarnessJudgmentService } from "./judgment-service";
import { HarnessRuntimeFeatureService } from "./runtime-feature-service";
import { HarnessSessionOptionsService } from "./session-options-service";
import { HarnessBrowserObservationService } from "./browser-observation-service";
import { HarnessManagedBrowserService } from "./managed-browser-service";
import { activateHarnessExtensionLink } from "./extension-links-service";
import { HarnessComputerObservationService } from "./computer-observation-service";
import { HarnessComputerWorkspaceService } from "./computer-workspace-service";
import { isComputerWorkspaceCommand, type ComputerWorkspaceCommand } from "../computer-workspace-protocol";
import { isComputerObservationKind, type ComputerObservationOperation } from "../computer-observation-protocol";
import { isBrowserObservationKind, type BrowserObservationOperation } from "../browser-observation-protocol";
import { isIdaOperationKind, type HarnessIdaOperation } from "../ida-details-protocol";
import { isSessionOptionsKind, type SessionOptionsOperation } from "../session-options-protocol";
import { type JudgmentOperation } from "../judgments-protocol";
import { isRuntimeFeatureKind, type RuntimeFeatureOperation } from "../runtime-features-protocol";

function isRuntimeFeatureOperation(operation: { kind: string }): operation is RuntimeFeatureOperation {
	return isRuntimeFeatureKind(operation.kind);
}
import { HarnessAnnotationService } from "./annotation-service";
import { HarnessAccountStatusService } from "./account-status-service";
import * as path from "node:path";
import { realpath } from "node:fs/promises";
import { Encoding, countTokens } from "@oh-my-pi/pi-natives";
import type { DaemonSnapshot } from "../../launch/protocol";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { listServices, requestService, startService } from "../../launch/services";
import type { AgentSession } from "../../session/agent-session";
import type { HarnessServiceRow, WorkbenchOperation } from "../workbench-protocol";
import { validateWorkbenchOperation, validateWorkbenchResult } from "../workbench-protocol";
import { SessionControlError } from "./session-control-service";

function isAdvisorConfigOperation(operation: WorkbenchOperation): operation is AdvisorConfigOperation {
	return isAdvisorConfigKind(operation.kind);
}
function isLocalResourceOperation(operation: WorkbenchOperation): operation is LocalResourceOperation {
	return isLocalResourceKind(operation.kind);
}
function isDictationOperation(operation: WorkbenchOperation): operation is DictationOperation {
	return isDictationKind(operation.kind);
}

function isSessionTitlesOperation(operation: WorkbenchOperation): operation is SessionTitlesOperation {
	return isSessionTitlesKind(operation.kind);
}
function isPredictionChannelOperation(operation: WorkbenchOperation): operation is PredictionChannelOperation {
	return isPredictionKind(operation.kind);
}
function isMaintenanceOperation(operation: WorkbenchOperation): operation is MaintenanceOperation {
	return isMaintenanceKind(operation.kind);
}
function isArchiveOperation(operation: WorkbenchOperation): operation is ArchiveOperation {
	return isArchiveOperationKind(operation.kind);
}
function isSessionOptionsOperation(operation: WorkbenchOperation): operation is SessionOptionsOperation {
	return isSessionOptionsKind(operation.kind);
}
function isIdaOperation(operation: WorkbenchOperation): operation is HarnessIdaOperation {
	return isIdaOperationKind(operation.kind);
}
function isBrowserObservationOperation(operation: WorkbenchOperation): operation is BrowserObservationOperation {
	return isBrowserObservationKind(operation.kind);
}
function isComputerWorkspaceOperation(operation: WorkbenchOperation): operation is ComputerWorkspaceCommand {
	return isComputerWorkspaceCommand(operation.kind);
}
function isComputerObservationOperation(operation: WorkbenchOperation): operation is ComputerObservationOperation {
	return isComputerObservationKind(operation.kind);
}

function isEvaluationWorkspaceOperation(operation: WorkbenchOperation): operation is EvaluationWorkspaceOperation {
	return isEvaluationWorkspaceKind(operation.kind);
}

function isRatchetOperation(operation: WorkbenchOperation): operation is RatchetOperation {
	return isRatchetKind(operation.kind);
}

function isNativePreferenceOperation(operation: WorkbenchOperation): operation is NativePreferenceOperation {
	return isNativePreferenceKind(operation.kind);
}
export function projectService(daemon: DaemonSnapshot): HarnessServiceRow {
	return {
		name: daemon.name,
		instanceId: daemon.id + ":" + daemon.startedAt,
		state: daemon.state,
		startedAt: daemon.startedAt,
		...(daemon.previewUrl === undefined ? {} : { previewUrl: daemon.previewUrl }),
		...(daemon.pid === undefined ? {} : { pid: daemon.pid }),
		...(daemon.readyAt === undefined ? {} : { readyAt: daemon.readyAt }),
		...(daemon.exitedAt === undefined ? {} : { exitedAt: daemon.exitedAt }),
		...(daemon.exitCode === undefined ? {} : { exitCode: daemon.exitCode }),
		restartCount: daemon.restartCount,
		outputBytes: daemon.outputBytes,
		...(daemon.owner === undefined ? {} : { ownerId: daemon.owner, ownerAgentId: daemon.owner }),
		mode: daemon.detached ? "detached" : daemon.persist ? "persist" : "session",
	};
}

/** Uses the current worker's native ToolSession and its lifecycle/owner subscriptions. */
export class HarnessWorkbenchService {
	readonly advisorConfig: HarnessAdvisorConfigService;
	readonly contextView: HarnessContextViewService;
	readonly titles: HarnessSessionTitlesService;
	readonly prediction: HarnessPredictionService;
	readonly maintenance: HarnessMaintenanceService;
	readonly archive: HarnessArchiveService;
	readonly agentModels: HarnessAgentModelService;
	readonly sessionRestore: HarnessSessionRestoreService;
	readonly runtimeQueue: HarnessRuntimeQueueService;
	readonly queuedCompaction: HarnessQueuedCompactionService;
	readonly nativePreferences: HarnessNativePreferencesService;
	readonly featureSettings: HarnessFeatureSettingsService;
	readonly portability: HarnessSessionPortabilityService;
	readonly compression: HarnessSessionCompressionService;
	readonly worktrees: HarnessSessionWorktreesService;
	planControl: HarnessModeControlService | undefined;
	readonly evaluations: HarnessEvaluationWorkspaceService;
	readonly ratchet: HarnessRatchetService;
	readonly resources: HarnessResourceService;
	readonly ida: HarnessIdaService;
	readonly agentBtw: HarnessAgentBtwService;
	readonly sessionGui: HarnessSessionGuiService;
	readonly skillshare: HarnessSkillshareService;
	readonly media: HarnessMediaService;
	readonly benchmarks: HarnessBenchmarkService;
	readonly views: HarnessRuntimeViews;
	readonly catalog: HarnessRuntimeCatalogService;
	readonly judgments: HarnessJudgmentService;
	readonly runtimeFeatures: HarnessRuntimeFeatureService;
	readonly accounts: HarnessAccountStatusService;
	readonly annotations: HarnessAnnotationService;
	readonly sessionOptions: HarnessSessionOptionsService;
	readonly idaDetails: HarnessIdaDetailsService;
	readonly browserObservation: HarnessBrowserObservationService;
	readonly managedBrowser: HarnessManagedBrowserService;
	readonly computerObservation: HarnessComputerObservationService;
	readonly computerWorkspace: HarnessComputerWorkspaceService;
	constructor(
		readonly session: AgentSession,
		readonly liveAudio = new HarnessLiveAudioService(session),
		mcpManager?: MCPManager,
	) {
		this.advisorConfig = new HarnessAdvisorConfigService(session);
		this.contextView = new HarnessContextViewService(session);
		this.titles = new HarnessSessionTitlesService(session);
		this.prediction = new HarnessPredictionService(session);
		if (typeof session.runEphemeralTurn === "function") this.prediction.enableMessagePrediction(session);
		this.maintenance = new HarnessMaintenanceService(session);
		this.archive = new HarnessArchiveService(session);
		this.agentModels = new HarnessAgentModelService(session);
		this.sessionRestore = new HarnessSessionRestoreService(session);
		this.queuedCompaction = new HarnessQueuedCompactionService(session);
		this.runtimeQueue = new HarnessRuntimeQueueService(session, this.queuedCompaction);
		this.nativePreferences = new HarnessNativePreferencesService(session);
		this.computerWorkspace = new HarnessComputerWorkspaceService(session);
		this.featureSettings = new HarnessFeatureSettingsService(session, this.computerWorkspace);
		this.portability = new HarnessSessionPortabilityService(session);
		this.compression = new HarnessSessionCompressionService(session);
		this.worktrees = new HarnessSessionWorktreesService(session);
		this.ratchet = new HarnessRatchetService(session);
		this.evaluations = new HarnessEvaluationWorkspaceService(session);
		this.skillshare = new HarnessSkillshareService(session);
		this.sessionGui = new HarnessSessionGuiService(session);
		this.agentBtw = new HarnessAgentBtwService(session);
		this.ida = new HarnessIdaService(session);
		this.resources = new HarnessResourceService(session);
		this.accounts = new HarnessAccountStatusService(session);
		this.judgments = new HarnessJudgmentService(session);
		this.runtimeFeatures = new HarnessRuntimeFeatureService(session, mcpManager);
		this.catalog = new HarnessRuntimeCatalogService(session, mcpManager);
		this.views = new HarnessRuntimeViews(session, liveAudio);
		this.benchmarks = new HarnessBenchmarkService(session);
		this.media = new HarnessMediaService(session);
		this.annotations = new HarnessAnnotationService(session);
		this.sessionOptions = new HarnessSessionOptionsService(session);
		this.idaDetails = new HarnessIdaDetailsService(session);
		this.browserObservation = new HarnessBrowserObservationService(session);
		this.managedBrowser = new HarnessManagedBrowserService(session);
		this.computerObservation = new HarnessComputerObservationService(session, undefined, this.computerWorkspace);
	}
	dispose(): void {
		this.views.dispose();
		this.queuedCompaction.dispose();
		this.contextView.dispose();
		this.prediction.dispose();
		this.portability.dispose();
		this.compression.dispose();
		this.worktrees.dispose();
		this.maintenance.dispose();
		this.ratchet.dispose();
		this.evaluations.dispose();
		this.computerObservation.dispose();
		void this.computerWorkspace.dispose().catch(() => {});
		this.browserObservation.dispose();
		this.managedBrowser.dispose();
		this.idaDetails.dispose();
		this.ida.dispose();
		this.agentBtw.dispose();
		this.skillshare.dispose();
		this.accounts.dispose();
		this.benchmarks.dispose();
		this.media.dispose();
		this.liveAudio.dispose();
	}
	async execute(operation: WorkbenchOperation): Promise<unknown> {
		validateWorkbenchOperation(operation);
		const result = await this.#execute(operation);
		validateWorkbenchResult(operation.kind, result);
		return result;
	}
	async #execute(operation: WorkbenchOperation): Promise<unknown> {
		if (
			operation.kind === "search.credentials.list" ||
			operation.kind === "search.credentials.set" ||
			operation.kind === "search.credentials.remove"
		)
			return new HarnessSearchCredentialsService(this.session).execute(operation);
		if (isEvaluationWorkspaceOperation(operation)) return this.evaluations.execute(operation);
		if (isAdvisorConfigOperation(operation)) return this.advisorConfig.execute(operation);
		if (isLocalResourceOperation(operation)) return this.resources.local(operation);
		if (isDictationOperation(operation)) return this.liveAudio.dictation(operation);
		if (isSessionTitlesOperation(operation)) return this.titles.execute(operation);
		if (isPredictionChannelOperation(operation)) return this.prediction.execute(operation);
		if (isMaintenanceOperation(operation)) return this.maintenance.execute(operation);
		if (isArchiveOperation(operation)) return this.archive.execute(operation);
		if (operation.kind === "agent.model.inspect") return this.agentModels.execute(operation);
		if (operation.kind === "session.restore.inspect") return this.sessionRestore.execute(operation);
		if (isRuntimeQueueOperation(operation)) return this.runtimeQueue.execute(operation);
		if (isNativePreferenceOperation(operation)) return this.nativePreferences.execute(operation);
		if (isFeatureSettingsOperation(operation)) return this.featureSettings.execute(operation);
		if (isSessionPortabilityOperation(operation)) return this.portability.execute(operation);
		if (isSessionCompressionOperation(operation)) return this.compression.execute(operation);
		if (isSessionWorktreeOperation(operation)) return this.worktrees.execute(operation);
		if (isNativePlanReviewOperation(operation)) {
			if (!this.planControl) throw new Error("Plan review host unavailable");
			return this.planControl.executeReview(operation);
		}
		if (operation.kind === "accounts.logout") return this.accounts.logout(operation.sessionId, operation.accountId);
		if (isRatchetOperation(operation)) return this.ratchet.execute(operation);
		if (isComputerWorkspaceOperation(operation)) return this.computerWorkspace.execute(operation);
		if (isComputerObservationOperation(operation)) return this.computerObservation.execute(operation);
		if (operation.kind === "browser.managed.prepare") return this.managedBrowser.prepare(operation.sessionId);
		if (operation.kind === "browser.webmcp.invoke") return this.managedBrowser.webMcpInvoke(operation);
		if (operation.kind === "extensions.links.activate") return activateHarnessExtensionLink(this.session, operation);
		if (isBrowserObservationOperation(operation)) return this.browserObservation.execute(operation);
		if (isIdaOperation(operation)) return this.idaDetails.execute(operation);
		if (isSessionOptionsOperation(operation)) return this.sessionOptions.execute(operation);
		if (operation.kind === "resource.read") return this.resources.read(operation);
		if (
			operation.kind === "ida.status" ||
			operation.kind === "ida.view" ||
			operation.kind === "ida.prepare" ||
			operation.kind === "ida.commit" ||
			operation.kind === "ida.cancel"
		)
			return this.ida.execute(operation);
		if (
			operation.kind === "agent.btw.read" ||
			operation.kind === "agent.btw.ask" ||
			operation.kind === "agent.btw.abort"
		)
			return this.agentBtw.execute(operation);
		if (operation.kind === "prediction.control") {
			if (operation.sessionId !== this.session.sessionId)
				throw new SessionControlError("COMMAND_BLOCKED", "Prediction session changed");
			return this.prediction.control(operation.action);
		}
		if (
			operation.kind === "session.queue.ack" ||
			operation.kind === "session.queue.steer" ||
			operation.kind === "session.queue.list" ||
			operation.kind === "session.queue.remove" ||
			operation.kind === "session.queue.takeback" ||
			operation.kind === "session.tier.get" ||
			operation.kind === "session.tier.set" ||
			operation.kind === "session.skills.list"
		)
			return this.sessionGui.execute(operation);
		if (
			operation.kind === "skillshare.status" ||
			operation.kind === "skillshare.home" ||
			operation.kind === "skillshare.search" ||
			operation.kind === "skillshare.package" ||
			operation.kind === "skillshare.installed" ||
			operation.kind === "skillshare.tokens" ||
			operation.kind === "skillshare.prepare" ||
			operation.kind === "skillshare.execute" ||
			operation.kind === "skillshare.action" ||
			operation.kind === "skillshare.discard"
		)
			return this.skillshare.execute(operation);
		if (
			operation.kind === "live.audio.prepare" ||
			operation.kind === "live.audio.start" ||
			operation.kind === "live.audio.status" ||
			operation.kind === "live.audio.mute" ||
			operation.kind === "live.audio.release"
		)
			return this.liveAudio.execute(operation);
		if (
			operation.kind === "media.models" ||
			operation.kind === "media.list" ||
			operation.kind === "media.start" ||
			operation.kind === "media.read" ||
			operation.kind === "media.cancel" ||
			operation.kind === "media.resume" ||
			operation.kind === "media.close"
		)
			return this.media.execute(operation);
		if (
			operation.kind === "benchmarks.list" ||
			operation.kind === "benchmarks.start" ||
			operation.kind === "benchmarks.read" ||
			operation.kind === "benchmarks.cancel" ||
			operation.kind === "benchmarks.close"
		)
			return this.benchmarks.execute(operation);
		if (
			operation.kind === "templates.list" ||
			operation.kind === "templates.get" ||
			operation.kind === "templates.prepare" ||
			operation.kind === "mcp.runtime.status"
		)
			return this.catalog.execute(operation);
		if (
			operation.kind === "judgments.list" ||
			operation.kind === "judgments.create" ||
			operation.kind === "judgments.read" ||
			operation.kind === "judgments.cancel" ||
			operation.kind === "judgments.close" ||
			operation.kind === "judgments.retry"
		)
			return this.judgments.execute(operation as JudgmentOperation);
		if (isRuntimeFeatureOperation(operation)) return this.runtimeFeatures.execute(operation);
		if (operation.kind === "annotations.capture" || operation.kind === "annotations.prepare")
			return this.annotations.execute(operation);
		if (operation.kind === "accounts.status") return this.accounts.get(operation.refresh);
		if (operation.kind === "accounts.status.details") return this.accounts.get(operation.refresh, true);
		if (operation.kind === "tokens.count") {
			const text = operation.text;
			return {
				bytes: Buffer.byteLength(text, "utf8"),
				chars: [...text].length,
				lines: text.length ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0,
				encodings: Object.values(Encoding).map(encoding => ({ encoding, tokens: countTokens(text, encoding) })),
			};
		}
		if (operation.kind === "runtime.models.describe") {
			const model = this.session.modelRegistry
				.getAvailable("all")
				.find(model => model.provider + "/" + model.id === operation.selector);
			if (!model) throw new SessionControlError("INVALID_ARGUMENT", "The selected model is unavailable");
			return { model: projectRuntimeModel(model, true) };
		}
		if (operation.kind === "runtime.models.list") {
			const models = this.session.modelRegistry
				.getAvailable("all")
				.filter(model => !operation.modelKind || (model.kind ?? "chat") === operation.modelKind)
				.map(model => projectRuntimeModel(model))
				.sort((left, right) => left.selector.localeCompare(right.selector));
			const start = operation.cursor ? models.findIndex(model => model.selector === operation.cursor) + 1 : 0;
			if (operation.cursor && start === 0)
				throw new SessionControlError("INVALID_ARGUMENT", "Model catalog changed; refresh the list");
			const page = models.slice(start, start + (operation.limit ?? 200));
			return {
				models: page,
				total: models.length,
				...(start + page.length < models.length && page.length
					? { nextCursor: page[page.length - 1]!.selector }
					: {}),
			};
		}
		const session = this.session.harnessToolSession;
		if (!session) throw new SessionControlError("COMMAND_BLOCKED", "Service context is unavailable");
		const enabled = cfgLaunchEnabled.get(session.settings);
		if (operation.kind === "services.list")
			return { enabled, services: (await listServices(session)).slice(0, 500).map(projectService) };
		// An older broker silently ignores unknown fence fields. Never send it a GUI mutation.
		const ping = await requestService(session, { op: "ping" });
		if (ping.op !== "ping" || !ping.instanceFencing)
			throw new SessionControlError(
				"COMMAND_BLOCKED",
				"This project broker needs to be restarted with the updated Runtime before controlling services",
			);
		if (operation.kind === "services.start") {
			const spec = operation.spec;
			const root = await realpath(session.cwd);
			const cwd = await realpath(path.resolve(root, spec.cwd ?? "."));
			const relative = path.relative(root, cwd);
			if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
				throw new SessionControlError("INVALID_ARGUMENT", "Service directory must stay inside the workspace");
			const result = await startService(session, {
				...spec,
				cwd,
				replace: false,
				awaitReady: false,
				...(spec.ready ? { ready: { ...spec.ready, timeout: spec.ready.timeoutMs / 1000 } } : {}),
			});
			return { service: projectService(result.daemon), readyTimedOut: result.readyTimedOut };
		}
		const named = { name: operation.name, expectedInstanceId: operation.instanceId };
		if (operation.kind === "services.logs") {
			const result = await requestService(session, {
				op: "logs",
				...named,
				lines: operation.lines ?? 200,
				head: false,
				follow: false,
				timeoutMs: 1000,
				cursor: operation.cursor,
				renderTerminalRows: true,
			});
			if (result.op !== "logs") throw new Error("Unexpected service logs response");
			return {
				instanceId: operation.instanceId,
				text: sanitizeText(result.terminalRows?.join("\n") ?? result.text).slice(-65536),
				cursor: result.cursor,
				state: result.state,
			};
		}
		const result = await requestService(
			session,
			operation.kind === "services.stop"
				? { op: "stop", ...named, timeoutMs: 5000 }
				: operation.kind === "services.restart"
					? { op: "restart", ...named }
					: operation.kind === "services.mode.set"
						? { op: "mode", ...named, mode: operation.mode }
						: { op: "send", ...named, data: operation.text },
		);
		if (!("daemon" in result)) throw new Error("Unexpected service response");
		return { service: projectService(result.daemon) };
	}
}

function isRuntimeQueueOperation(operation: WorkbenchOperation): operation is RuntimeQueueOperation {
	return isRuntimeQueueKind(operation.kind);
}

/** Public model facts only; endpoints, headers and credential material stay in Runtime. */
export function projectRuntimeModel(model: Model, includeExecution = false): RuntimeModelChoice {
	const compat = model.compat as Record<string, unknown> | undefined;
	return {
		selector: model.provider + "/" + model.id,
		name: model.name,
		provider: model.provider,
		kind: model.kind ?? "chat",
		image: model.input.includes("image"),
		reasoning: model.reasoning,
		...(model.contextWindow === null ? {} : { contextWindow: model.contextWindow }),
		...(model.maxTokens === null ? {} : { maxTokens: model.maxTokens }),
		...(model.webSearch ? { webSearch: model.webSearch } : {}),
		...(includeExecution
			? {
					...(model.serviceTiers ? { serviceTiers: [...model.serviceTiers] } : {}),
					...(model.promptCache ? { promptCache: { ...model.promptCache } } : {}),
					...(model.promptCacheConfig ? { promptCacheConfig: { ...model.promptCacheConfig } } : {}),
					compatibility: {
						...(typeof compat?.supportsMessageThreads === "boolean"
							? { supportsMessageThreads: compat.supportsMessageThreads }
							: {}),
						...(typeof compat?.toolNamePrefix === "string" ? { toolNamePrefix: compat.toolNamePrefix } : {}),
						...(typeof compat?.statefulResponses === "boolean"
							? { statefulResponses: compat.statefulResponses }
							: {}),
						...(model.preferWebsockets === undefined ? {} : { preferWebsockets: model.preferWebsockets }),
						...(model.useResponsesLite === undefined ? {} : { useResponsesLite: model.useResponsesLite }),
					},
				}
			: {}),
	};
}

function isFeatureSettingsOperation(operation: WorkbenchOperation): operation is FeatureSettingsOperation {
	return isFeatureSettingsKind(operation.kind);
}

function isSessionPortabilityOperation(operation: WorkbenchOperation): operation is SessionPortabilityOperation {
	return isSessionPortabilityKind(operation.kind);
}

function isSessionCompressionOperation(operation: WorkbenchOperation): operation is SessionCompressionOperation {
	return isSessionCompressionKind(operation.kind);
}

function isSessionWorktreeOperation(operation: WorkbenchOperation): operation is SessionWorktreeOperation {
	return isSessionWorktreeKind(operation.kind);
}

function isNativePlanReviewOperation(operation: WorkbenchOperation): operation is NativePlanReviewOperation {
	return isNativePlanReviewKind(operation.kind);
}

import { HarnessSearchCredentialsService } from "./search-credentials-service";
import { inspectHarnessAntigravity } from "./antigravity-readiness";
import { HarnessCommitService } from "./commit-service";
import { HarnessPromptHistoryService } from "./prompt-history-service";
import { HarnessModelSystemTemplatesService } from "./model-system-templates-service";
import { HarnessModelAuthService } from "./model-auth-service";
import { HarnessModelRosterService } from "./model-roster-service";
import type { ModelServicesOperation } from "../model-services-protocol";
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
import { HarnessDisassemblerService } from "./disassembler-service";
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
import { isDisassemblerKind, type DisassemblerOperation } from "../disassembler-protocol";
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
import type { UnitSnapshot } from "../../daemon/protocol";
import { sanitizeText } from "@oh-my-pi/pi-utils";
import { listServices, modeService, requestService, startService } from "../../launch/services";
import type { AgentSession } from "../../session/agent-session";
import type { HarnessServiceRow, WorkbenchOperation } from "../workbench-protocol";
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
function isDisassemblerOperation(operation: WorkbenchOperation): operation is DisassemblerOperation {
	return isDisassemblerKind(operation.kind);
}
function isSessionOptionsOperation(operation: WorkbenchOperation): operation is SessionOptionsOperation {
	return isSessionOptionsKind(operation.kind);
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
export function projectService(daemon: UnitSnapshot, sessionId?: string): HarnessServiceRow {
	return {
		name: daemon.key,
		scope:
			daemon.scope.kind === "project" && daemon.owner === sessionId && sessionId !== undefined
				? "session"
				: daemon.scope.kind,
		instanceId: daemon.id + ":" + daemon.generation,
		state: daemon.state,
		startedAt: daemon.startedAt,
		previewUrl: daemon.previewUrl,
		pid: daemon.pids[0],
		readyAt: daemon.readyAt,
		exitedAt: daemon.exitedAt,
		exitCode: daemon.exitCode,
		restartCount: daemon.restartCount,
		outputBytes: daemon.outputBytes,
		...(daemon.owner === undefined ? {} : { ownerId: daemon.owner, ownerAgentId: daemon.owner }),
		mode:
			daemon.policy.survive === "detached" ? "detached" : daemon.policy.hold === "persist" ? "persist" : "session",
		manageable: daemon.kind === "proc" && daemon.scope.kind !== "global",
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
	readonly agentBtw: HarnessAgentBtwService;
	readonly sessionGui: HarnessSessionGuiService;
	readonly skillshare: HarnessSkillshareService;
	readonly media: HarnessMediaService;
	readonly benchmarks: HarnessBenchmarkService;
	readonly modelSystemTemplates: HarnessModelSystemTemplatesService;
	readonly modelAuth: HarnessModelAuthService;
	readonly modelRoster: HarnessModelRosterService;
	readonly promptHistory: HarnessPromptHistoryService;
	#commit: HarnessCommitService | undefined;
	readonly views: HarnessRuntimeViews;
	readonly catalog: HarnessRuntimeCatalogService;
	readonly judgments: HarnessJudgmentService;
	readonly runtimeFeatures: HarnessRuntimeFeatureService;
	readonly accounts: HarnessAccountStatusService;
	readonly annotations: HarnessAnnotationService;
	readonly sessionOptions: HarnessSessionOptionsService;
	readonly disassembler: HarnessDisassemblerService;
	readonly browserObservation: HarnessBrowserObservationService;
	readonly managedBrowser: HarnessManagedBrowserService;
	readonly computerObservation: HarnessComputerObservationService;
	readonly computerWorkspace: HarnessComputerWorkspaceService;
	constructor(
		readonly session: AgentSession,
		readonly liveAudio = new HarnessLiveAudioService(session),
		mcpManager?: MCPManager,
		readonly runtimeEpoch: () => number = () => 0,
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
		this.resources = new HarnessResourceService(session);
		this.accounts = new HarnessAccountStatusService(session);
		this.judgments = new HarnessJudgmentService(session);
		this.runtimeFeatures = new HarnessRuntimeFeatureService(session, mcpManager);
		this.catalog = new HarnessRuntimeCatalogService(session, mcpManager);
		this.modelSystemTemplates = new HarnessModelSystemTemplatesService(session);
		this.modelAuth = new HarnessModelAuthService(session);
		this.modelRoster = new HarnessModelRosterService(session);
		this.promptHistory = new HarnessPromptHistoryService(session);
		this.views = new HarnessRuntimeViews(session, liveAudio);
		this.views.modelServicesReader = operation => this.executeModelServices(operation);
		this.views.commitReader = operation => this.commit.execute(operation);
		this.views.promptHistoryReader = operation => this.promptHistory.execute(operation);
		this.benchmarks = new HarnessBenchmarkService(session);
		this.media = new HarnessMediaService(session);
		this.annotations = new HarnessAnnotationService(session);
		this.sessionOptions = new HarnessSessionOptionsService(session);
		this.disassembler = new HarnessDisassemblerService(session);
		this.browserObservation = new HarnessBrowserObservationService(session);
		this.managedBrowser = new HarnessManagedBrowserService(session);
		this.computerObservation = new HarnessComputerObservationService(session, undefined, this.computerWorkspace);
	}
	get commit(): HarnessCommitService {
		return (this.#commit ??= new HarnessCommitService(this.session, this.runtimeEpoch));
	}
	dispose(): void {
		this.#commit?.dispose();
		this.modelAuth.dispose();
		this.modelRoster.dispose();
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
		this.disassembler.dispose();
		this.agentBtw.dispose();
		this.skillshare.dispose();
		this.accounts.dispose();
		this.benchmarks.dispose();
		this.media.dispose();
		this.liveAudio.dispose();
	}
	async executeModelServices(operation: ModelServicesOperation): Promise<unknown> {
		if (operation.kind === "models.available.refresh") return this.modelRoster.refreshAll(operation.sessionId);
		if (operation.kind === "models.available.read" || operation.kind === "models.available.release")
			return this.modelRoster.available(operation);
		if (operation.kind === "models.antigravity.readiness")
			return inspectHarnessAntigravity(this.session, operation.sessionId);
		if (operation.kind.startsWith("models.systemTemplates."))
			return this.modelSystemTemplates.execute(
				operation as Extract<ModelServicesOperation, { kind: `models.systemTemplates.${string}` }>,
			);
		if (operation.kind.startsWith("models.auth."))
			return this.modelAuth.execute(operation as Extract<ModelServicesOperation, { kind: `models.auth.${string}` }>);
		if (operation.kind === "models.provider.roster.refresh")
			return this.modelRoster.refresh(operation.sessionId, operation.providerId);
		if (operation.kind === "models.accounts.resetPolicy.set")
			return this.accounts.setResetPolicy(operation.sessionId, operation.key, operation.mode);
		throw new SessionControlError("COMMAND_BLOCKED", "Unknown native model operation");
	}
	async execute(operation: WorkbenchOperation): Promise<unknown> {
		const result = await this.#execute(operation);
		return result;
	}
	async #execute(operation: WorkbenchOperation): Promise<unknown> {
		if (operation.kind === "commit.draft.select" || operation.kind === "commit.draft.execute")
			return this.commit.execute(operation);
		if (operation.kind === "history.prompts.delete") return this.promptHistory.execute(operation);
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
		if (isDisassemblerOperation(operation)) return this.disassembler.execute(operation);
		if (isSessionOptionsOperation(operation)) return this.sessionOptions.execute(operation);
		if (operation.kind === "resource.read") return this.resources.read(operation);
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
			operation.kind === "benchmarks.accounts.read" ||
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
		if (operation.kind === "services.list") {
			const [project, global] = await Promise.all([
				listServices(session),
				requestService(session, { op: "list", scope: { kind: "global" } }),
			]);
			return {
				enabled,
				services: [...project, ...global.units]
					.slice(0, 500)
					.map(unit => projectService(unit, this.session.sessionId)),
			};
		}
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
			return { service: projectService(result.daemon, this.session.sessionId), readyTimedOut: result.readyTimedOut };
		}
		const target = (await listServices(session)).find(
			unit => unit.key === operation.name && projectService(unit).instanceId === operation.instanceId,
		);
		if (!target)
			throw new SessionControlError("COMMAND_BLOCKED", "Service instance changed; refresh before trying again");
		const named = { unit: target.id, generation: target.generation };
		if (operation.kind === "services.logs") {
			const result = await requestService(session, {
				op: "logs",
				...named,
				lines: operation.lines ?? 200,
				head: false,
				follow: false,
				timeoutMs: 1000,
				cursor: operation.cursor,
			});
			return {
				instanceId: operation.instanceId,
				text: sanitizeText(result.terminalOutput || result.text).slice(-65536),
				cursor: result.cursor,
				state: result.unit.state,
			};
		}
		const unit =
			operation.kind === "services.mode.set"
				? await modeService(session, operation.name, operation.mode, undefined, named)
				: (
						await requestService(
							session,
							operation.kind === "services.stop"
								? { op: "stop", ...named, timeoutMs: 5000 }
								: operation.kind === "services.restart"
									? { op: "restart", ...named }
									: { op: "send", ...named, data: operation.text },
						)
					).unit;
		if (operation.kind === "services.stop" && unit.generation !== named.generation)
			throw new SessionControlError("COMMAND_BLOCKED", "Service instance changed; refresh before trying again");
		return { service: projectService(unit, this.session.sessionId) };
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
		snapcompactShape: model.snapcompactShape,
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

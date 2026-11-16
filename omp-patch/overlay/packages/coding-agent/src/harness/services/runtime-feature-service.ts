import { readHarnessTaskOptions } from "./task-options-service";
import { SessionManager } from "../../session/session-manager";
import { setSessionPinned } from "../../session/session-pins";
import { probeSessionLeases } from "../../session/session-storage";
import type { MCPManager } from "../../mcp/manager";
import type { AgentSession } from "../../session/agent-session";
import { clearApprovalGrants } from "../../tools/approval-cache";
import { type RuntimeFeatureOperation } from "../runtime-features-protocol";
import { inspectHarnessJob } from "./job-inspect";
import { HarnessMcpAuthService } from "./mcp-auth-service";
import { askHarnessSeance } from "./seance-service";
import { SessionControlError } from "./session-control-service";
import { ownedHarnessSessions } from "./owned-sessions";

/** OMP 18.11–18.12 features: remembered approvals, job inspection, MCP auth and Seance. */
export class HarnessRuntimeFeatureService {
	readonly mcpAuth: HarnessMcpAuthService;
	injectBtw?: (id: string) => Promise<{ sent: true }>;

	constructor(
		readonly session: AgentSession,
		manager?: MCPManager,
	) {
		this.mcpAuth = new HarnessMcpAuthService(session, manager);
	}

	async execute(operation: RuntimeFeatureOperation): Promise<unknown> {
		if (operation.sessionId !== this.session.sessionId) {
			throw new SessionControlError("INVALID_ARGUMENT", "The operation targets another session");
		}
		const result = await this.#run(operation);
		return result;
	}

	async #run(operation: RuntimeFeatureOperation): Promise<unknown> {
		switch (operation.kind) {
			case "agent.spawn.options":
				return readHarnessTaskOptions(this.session, operation.definition);
			case "btw.inject":
				if (!this.injectBtw) throw new SessionControlError("COMMAND_BLOCKED", "BTW injection is unavailable");
				return this.injectBtw(operation.injectId);
			case "session.lease.inspect":
				return probeSessionLeases(operation.targetSessionIds);
			case "session.history.pin":
				await setSessionPinned(operation.targetSessionId, operation.pinned, this.session.settings.getAgentDir());
				return { targetSessionId: operation.targetSessionId, pinned: operation.pinned };
			case "session.history.rename": {
				let title: string | null;
				const owner = ownedHarnessSessions(this.session).find(
					session => session.sessionManager.getSessionId() === operation.targetSessionId,
				);
				if (owner) {
					title = await owner.renameHarnessTitle(operation.title);
				} else {
					const target = (await SessionManager.listAll()).find(row => row.id === operation.targetSessionId);
					if (!target) throw new SessionControlError("INVALID_ARGUMENT", "The saved session is unavailable");
					title = await SessionManager.renameSessionTitle(target.path, operation.title, { cwd: target.cwd });
				}
				if (title === null)
					throw new SessionControlError(
						"COMMAND_BLOCKED",
						"This session is owned by another running instance; rename it there",
					);
				return { targetSessionId: operation.targetSessionId, title };
			}
			case "approvals.forget":
				// Same effect as `/forget-approvals`: the approval-cache DB and every session's store.
				clearApprovalGrants(this.session.settings.getAgentDir());
				return { cleared: true };
			case "jobs.inspect":
				return inspectHarnessJob(this.session, operation.jobId);
			case "mcp.auth.reauth":
				return this.mcpAuth.reauth(operation.name);
			case "mcp.auth.unauth":
				return this.mcpAuth.unauth(operation.name);
			case "mcp.auth.reconnect":
				return this.mcpAuth.reconnect(operation.name);
			case "seance.ask":
				return askHarnessSeance(this.session, operation);
		}
	}
}

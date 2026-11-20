import type { AgentSession } from "../../session/agent-session";
import { runtimeText } from "../locale";
import { withHarnessSessionTransition } from "./session-control-service";

export class HarnessForkError extends Error {
	constructor(
		readonly code: "BUSY_STREAMING" | "BUSY_COMPACTING" | "MODE_CONFLICT" | "COMMAND_BLOCKED",
		message: string,
	) {
		super(message);
		this.name = "HarnessForkError";
	}
}

export class HarnessForkService {
	constructor(private readonly session: AgentSession) {}

	async fork(beforeTransition?: () => Promise<void>): Promise<{ forked: boolean; sessionId: string }> {
		if (this.session.isCompacting) throw new HarnessForkError("BUSY_COMPACTING", "Runtime is compacting");
		if (this.session.getVibeModeState()?.enabled) {
			throw new HarnessForkError("MODE_CONFLICT", "Exit vibe mode before forking the session");
		}
		return withHarnessSessionTransition(
			this.session,
			async () => {
				const forked = await this.session.fork(undefined, { requireIdle: true });
				if (!forked)
					throw new HarnessForkError(
						"COMMAND_BLOCKED",
						runtimeText(
							"会话分叉已取消，或未启用持久化。",
							"Session fork was cancelled or persistence is disabled",
						),
					);
				return { forked: true, sessionId: this.session.sessionManager.getSessionId() };
			},
			beforeTransition,
		);
	}
}

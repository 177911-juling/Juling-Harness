import type { AgentSession } from "../../session/agent-session";
import type { HarnessInteractionGateway } from "./interaction-port";
import { installHarnessConfigurationApproval } from "./configuration-approval";

/** Published service entry delegates to the same native approval host as 18.8. */
export class HarnessCfgService {
	#release: (() => void) | undefined;
	constructor(
		readonly session: AgentSession,
		readonly interaction: HarnessInteractionGateway,
	) {
		this.rebind();
	}
	rebind(): void {
		this.#release?.();
		const tools = this.session.harnessToolSession;
		if (tools && (tools.taskDepth ?? 0) === 0) tools.settingsApproval = true;
		this.#release = installHarnessConfigurationApproval(this.session, this.interaction);
	}
	dispose(): void {
		this.#release?.();
		this.#release = undefined;
		const tools = this.session.harnessToolSession;
		if (tools) tools.settingsApproval = false;
	}
}

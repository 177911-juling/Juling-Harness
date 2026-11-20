import { randomUUID } from "node:crypto";
import { parseConfiguredThinkingLevel } from "@oh-my-pi/pi-tui/thinking";
import { setCfgApprovalHost } from "../../internal-urls/cfg-protocol";
import type { AgentSession } from "../../session/agent-session";
import { cfgDefaultThinkingLevel } from "../../session/settings";
import type { HarnessInteractionGateway } from "./interaction-port";

/** Own the native cfg:// host for the desktop process, including recycled session slots. */
export function installHarnessConfigurationApproval(
	session: AgentSession,
	interaction: HarnessInteractionGateway,
): () => void {
	let disposed = false;
	setCfgApprovalHost({
		get persistentSettings() {
			return session.settings;
		},
		approve: async request => {
			if (disposed) return "deny";
			const sessionId = session.sessionId;
			const commandId = "harness-cfg:" + randomUUID();
			const answer = await interaction.approveConfiguration(
				{
					commandId,
					title: "Configuration change",
					details: {
						path: request.path,
						previous: request.previous,
						value: request.value,
						save: request.save,
						...(request.shadowedBy ? { shadowedBy: request.shadowedBy } : {}),
						expiresAt: Date.now() + 10_000,
					},
				},
				10_000,
			);
			return disposed || session.sessionId !== sessionId ? "deny" : answer;
		},
		applied: change => {
			if (
				disposed ||
				change.settings !== session.settings ||
				change.path !== cfgDefaultThinkingLevel.id ||
				typeof change.value !== "string"
			)
				return;
			const level = parseConfiguredThinkingLevel(change.value);
			if (level !== undefined) session.setThinkingLevel(level);
		},
	});
	return () => {
		disposed = true;
		setCfgApprovalHost(null);
		if (interaction.pending()?.request.commandId.startsWith("harness-cfg:"))
			interaction.cancel("Configuration approval host closed");
	};
}

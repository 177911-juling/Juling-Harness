import type { AgentSession } from "../../session/agent-session";
import { isAgentViewSession, type AgentViewSession } from "../../session/agent-session-handle";
import type { ExtensionLinkOperation } from "../extension-links-protocol";
import { ownedHarnessAgent } from "./owned-sessions";
import { SessionControlError } from "./session-control-service";

export function harnessLinkTarget(
	session: AgentSession,
	target: { sessionId: string; sourceSessionId?: string; agentId?: string },
): AgentViewSession | undefined {
	if (target.sessionId !== session.sessionId)
		throw new SessionControlError("COMMAND_BLOCKED", "Extension links belong to another session");
	const owner = target.agentId ? ownedHarnessAgent(session, target.agentId)?.session : session;
	return owner &&
		isAgentViewSession(owner) &&
		(!target.sourceSessionId || target.sourceSessionId === owner.sessionManager.getSessionId())
		? owner
		: undefined;
}

export async function activateHarnessExtensionLink(
	session: AgentSession,
	operation: ExtensionLinkOperation,
): Promise<{ handled: boolean }> {
	const target = harnessLinkTarget(session, operation);
	if (!target)
		throw new SessionControlError("COMMAND_BLOCKED", "The extension owning this conversation is no longer running");
	return { handled: await target.activateHarnessLink(operation.url) };
}

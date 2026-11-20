import type { AgentSession } from "../../session/agent-session";
import { HarnessBtwError } from "./btw-service";

/** Resolve on admission, not at the end of the model turn; later provider errors never resend the prompt. */
export async function sendHarnessBtwInjection(session: AgentSession, text: string, sessionId: string): Promise<void> {
	if (session.hasPendingDeferredExtensions) await session.loadDeferredExtensions();
	if (session.sessionManager.getSessionId() !== sessionId)
		throw new HarnessBtwError("INTERACTION_STALE", "The main session changed before injection");
	const admission = Promise.withResolvers<void>();
	let admitted = false;
	void session
		.prompt(text, {
			expandPromptTemplates: false,
			runCommands: false,
			streamingBehavior: "steer",
			throwOnDrop: true,
			onPromptAdmitted: () => {
				admitted = true;
				admission.resolve();
			},
		})
		.then(
			() => {
				if (!admitted)
					admission.reject(new HarnessBtwError("COMMAND_BLOCKED", "The main session did not admit the injection"));
			},
			error => {
				if (!admitted) admission.reject(error);
			},
		);
	await admission.promise;
}

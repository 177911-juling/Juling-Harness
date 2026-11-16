import { HARNESS_HOST_SESSION_ORIGIN } from "../session/session-entries";

export type HarnessConversationOrigin = "cli" | "harness";

export function classifyHarnessSessionOrigin(header: { harnessOrigin?: string }): HarnessConversationOrigin {
	return header.harnessOrigin === HARNESS_HOST_SESSION_ORIGIN ? "harness" : "cli";
}

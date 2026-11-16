import { HARNESS_HOST_SESSION_ORIGIN } from "../session/session-entries";

export type HarnessConversationOrigin = "cli" | "harness";

/**
 * Sessions written before the Harness rename carry `studioOrigin: "studio-host"`.
 * They were created by this same product, so a reopened legacy conversation must
 * keep Harness semantics instead of degrading to a plain CLI session.
 */
const LEGACY_ORIGIN = "studio-host";

export function classifyHarnessSessionOrigin(header: {
	harnessOrigin?: string;
	studioOrigin?: string;
}): HarnessConversationOrigin {
	const origin = header.harnessOrigin ?? header.studioOrigin;
	return origin === HARNESS_HOST_SESSION_ORIGIN || origin === LEGACY_ORIGIN ? "harness" : "cli";
}

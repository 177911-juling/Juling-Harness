import type { Settings } from "../config/settings";

/** Kept for the Harness bootstrap API; native defaults now own all agent policy. */
export function applyHarnessDefaults(_settings: Settings): void {
	// GUI rendering and managed-runtime lifecycle are handled at their actual
	// adapters. Cache warming, recap and worker idle TTL inherit the CLI settings.
}

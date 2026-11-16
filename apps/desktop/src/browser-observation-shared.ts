import type { BrowserObservationEvent, BrowserObservationInput } from "@juling-harness/harness-protocol";
export const BROWSER_OBSERVATION_CHANNELS = { attach: "juling-harness:desktop:browser-attach", input: "juling-harness:desktop:browser-input", detach: "juling-harness:desktop:browser-detach", event: "juling-harness:desktop:browser-event" } as const;
export interface BrowserObservationAttach { observationId: string; sessionId: string; tabId: string }
export interface BrowserObservationResult { ok: boolean; message?: string }
export interface BrowserObservationControl { observationId: string; input: BrowserObservationInput }
export type { BrowserObservationEvent };

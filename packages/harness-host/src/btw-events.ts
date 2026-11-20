import {
  parseBtwSnapshot,
  type BtwSnapshot,
  type HarnessEventEnvelope,
} from "@juling-harness/harness-protocol";

export interface HarnessBtwEvent {
  readonly kind: "btw.changed";
  readonly snapshot: BtwSnapshot;
}

export interface HarnessBtwForward {
  readonly envelope: HarnessEventEnvelope<HarnessBtwEvent>;
}

/**
 * Live BTW side-channel fan-out. The Runtime owns a single slot and emits the
 * whole snapshot on every delta, so only the latest value matters and nothing
 * is retained for replay. A snapshot that fails the contract parse is dropped
 * rather than forwarded as `unknown`: BTW is advisory, and a malformed frame
 * must not be able to poison the Renderer's answer buffer.
 */
export class BtwEventFanout {
  readonly #listeners = new Set<(event: HarnessBtwForward) => void>();

  onEvent(listener: (event: HarnessBtwForward) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  forward(envelope: HarnessEventEnvelope): boolean {
    if (envelope.event === null || typeof envelope.event !== "object" || !("kind" in envelope.event)) return false;
    if (envelope.event.kind !== "btw.changed") return false;
    let snapshot: BtwSnapshot;
    try {
      snapshot = parseBtwSnapshot((envelope.event as { readonly snapshot?: unknown }).snapshot);
    } catch {
      return false;
    }
    const event: HarnessBtwForward = {
      envelope: { ...envelope, event: { kind: "btw.changed", snapshot } },
    };
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch {
        // Isolate sibling listeners.
      }
    }
    return true;
  }

  dispose(): void {
    this.#listeners.clear();
  }
}

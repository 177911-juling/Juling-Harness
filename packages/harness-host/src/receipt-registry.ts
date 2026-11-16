import { createHash } from "node:crypto";

import { canonicalJson, type IdempotencyKey, type HarnessOperation, type HarnessReceipt } from "@juling-harness/harness-protocol";

interface RegistryEntry {
  /**
   * sha256 of the canonical operation JSON, never the JSON itself: it is only
   * ever compared for equality, and prompt operations carry base64 images, so
   * retaining them across the whole capacity window would pin hundreds of MB.
   */
  operationHash: string;
  receipt: HarnessReceipt;
}

/** Same digest shape as `host-confirmation.ts`. */
function operationFingerprint(operation: HarnessOperation): string {
  return createHash("sha256").update(canonicalJson(operation)).digest("hex");
}

export type ReceiptLookup =
  | { kind: "miss" }
  | { kind: "replay"; receipt: HarnessReceipt }
  | { kind: "conflict" };

export class ReceiptRegistry {
  readonly #entries = new Map<IdempotencyKey, RegistryEntry>();

  constructor(private readonly capacity = 512) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError("Receipt registry capacity must be a positive integer");
    }
  }

  lookup(key: IdempotencyKey, operation: HarnessOperation): ReceiptLookup {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return { kind: "miss" };
    }
    return entry.operationHash === operationFingerprint(operation)
      ? { kind: "replay", receipt: structuredClone(entry.receipt) }
      : { kind: "conflict" };
  }

  remember(key: IdempotencyKey, operation: HarnessOperation, receipt: HarnessReceipt): void {
    this.#entries.delete(key);
    this.#entries.set(key, { operationHash: operationFingerprint(operation), receipt: structuredClone(receipt) });
    while (this.#entries.size > this.capacity) {
      const oldest = this.#entries.keys().next().value as IdempotencyKey | undefined;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }
}

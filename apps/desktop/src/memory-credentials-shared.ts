export const MEMORY_CREDENTIAL_CHANNELS = {
  status: "juling-harness:memory-credential-status",
  set: "juling-harness:memory-credential-set",
  remove: "juling-harness:memory-credential-remove",
} as const;

export interface MemoryCredentialInput { targetId: string | null; url: string }
export type MemoryCredentialResult = { ok: true; configured: boolean; syncSupported: boolean } | { ok: false; message: string };

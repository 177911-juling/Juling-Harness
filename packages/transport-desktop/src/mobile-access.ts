import type { WorkspaceId } from "@juling-harness/client-contract";

export const MOBILE_ACCESS_CHANNELS = {
  status: "juling-harness:mobile:status",
  start: "juling-harness:mobile:start",
  stop: "juling-harness:mobile:stop",
  pair: "juling-harness:mobile:pair",
  revoke: "juling-harness:mobile:revoke",
  exportCertificate: "juling-harness:mobile:certificate",
} as const;

export interface MobileAccessStatus {
  addresses: string[];
  projects: { id: WorkspaceId; name: string }[];
  active?: { origin: string; workspaceName: string; fingerprint: string; paired: boolean };
}

export interface MobileAccessApi {
  status(): Promise<MobileAccessStatus>;
  start(ip: string, workspaceId: WorkspaceId): Promise<void>;
  stop(): Promise<void>;
  pair(): Promise<{ url: string; qr: string; expiresAt: number }>;
  revoke(): Promise<void>;
  exportCertificate(): Promise<boolean>;
}

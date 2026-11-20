import type { ClientBootstrap, ClientCommandAccepted, ClientCommandRequest, ClientEvent, ClientQueryRequest, ClientQueryResponse, CommandName, QueryName, WorkspaceListReadModel } from "@juling-harness/client-contract";

export const REMOTE_CHANNELS = {
  openContext: "juling-harness:remote:open-context", closeContext: "juling-harness:remote:close-context",
  installRuntime: "juling-harness:remote:install-runtime",
  approve: "juling-harness:remote:approve", retryNetwork: "juling-harness:remote:retry-network",
  list: "juling-harness:remote:list", save: "juling-harness:remote:save", remove: "juling-harness:remote:remove", connect: "juling-harness:remote:connect", disconnect: "juling-harness:remote:disconnect", select: "juling-harness:remote:select",
  bootstrap: "juling-harness:remote:bootstrap", query: "juling-harness:remote:query", command: "juling-harness:remote:command", directories: "juling-harness:remote:directories", register: "juling-harness:remote:register", event: "juling-harness:remote:event", changed: "juling-harness:remote:changed",
} as const;
export type RemoteNetworkMode = "remote-first" | "remote-only" | "local-only";
export type RemotePreparationStage = "probe" | "confirmation" | "download" | "upload" | "install" | "verify" | "configure" | "connect";
export interface RemoteConnectionProfile {
  id: string; name: string; host: string; user?: string; port?: number;
  /** Detected information retained for display; never a user-supplied requirement. */
  platform?: "linux" | "win32" | "darwin";
  arch?: string; authMode?: "agent" | "password";
  installRoot?: string; networkMode?: RemoteNetworkMode; localProxyUrl?: string;
  installationApproved?: boolean; lastDirectory?: string;
}
export interface RemoteCredentials { password: string; }
export interface RemoteConnectionStatus {
  id: string;
  state: "disconnected" | "connecting" | "awaiting-approval" | "recovering" | "degraded" | "synchronizing" | "connected" | "failed";
  message?: string;
  arch?: string;
  generation?: number;
  attempt?: number;
  maxAttempts?: number;
  retryAt?: number;
  hostRestarted?: boolean;
  operation?: "installing-runtime";
  stage?: RemotePreparationStage;
  platform?: "linux" | "win32" | "darwin";
  installRoot?: string;
  receivedBytes?: number;
  totalBytes?: number;
  networkRoute?: "remote" | "local";
  networkMessage?: string;
  timeTravelSync?: "pending" | "synced" | "unsupported" | "error";
}
export interface RemoteInventory { profiles: RemoteConnectionProfile[]; statuses: RemoteConnectionStatus[]; activeId?: string | null; }
export interface RemoteDirectoryList { path: string; parent: string; directories: { name: string; path: string }[]; }
export interface RemoteApi {
  list(): Promise<RemoteInventory>;
  save(profile: Omit<RemoteConnectionProfile, "id"> & { id?: string }): Promise<RemoteConnectionProfile>;
  remove(id: string): Promise<void>;
  connect(id: string, credentials?: RemoteCredentials): Promise<void>;
  approveDeployment(id: string): Promise<void>;
  retryNetwork(id: string): Promise<void>;
  installRuntime(id: string): Promise<{ installed: boolean }>;
  disconnect(id: string): Promise<void>;
  select(id: string | null): Promise<void>;
  openContext?(id: string, scope: import("@juling-harness/client-contract").ClientContextScope): Promise<string>;
  closeContext?(id: string, contextId: string): Promise<void>;
  bootstrap(id: string, contextId?: string): Promise<ClientBootstrap>;
  query<T extends QueryName>(id: string, request: ClientQueryRequest<T>, contextId?: string): Promise<ClientQueryResponse<T>>;
  command<T extends CommandName>(id: string, request: ClientCommandRequest<T>, contextId?: string): Promise<ClientCommandAccepted<T>>;
  directories(id: string, path?: string): Promise<RemoteDirectoryList>;
  register(id: string, path: string): Promise<WorkspaceListReadModel>;
  onEvent(listener: (event: { id: string; generation: number; contextId?: string; event: ClientEvent }) => void): () => void;
  onChanged(listener: () => void): () => void;
}

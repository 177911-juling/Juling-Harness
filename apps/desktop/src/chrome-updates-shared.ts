export const CHROME_UPDATES_CHANNELS = {
  versionGet: "juling-harness:desktop:chrome-updates-version-get",
  check: "juling-harness:desktop:chrome-updates-check",
  startApp: "juling-harness:desktop:chrome-updates-start-app",
  startRuntime: "juling-harness:desktop:chrome-updates-start-runtime",
  importLocal: "juling-harness:desktop:chrome-updates-import-local",
  cancel: "juling-harness:desktop:chrome-updates-cancel",
  apply: "juling-harness:desktop:chrome-updates-apply",
  rollback: "juling-harness:desktop:chrome-updates-rollback",
  rollbackRuntime: "juling-harness:desktop:chrome-updates-rollback-runtime",
  pruneRuntime: "juling-harness:desktop:chrome-updates-prune-runtime",
  prefsGet: "juling-harness:desktop:chrome-updates-prefs-get",
  prefsSet: "juling-harness:desktop:chrome-updates-prefs-set",
  progress: "juling-harness:desktop:chrome-updates-progress",
  snapshot: "juling-harness:desktop:chrome-updates-snapshot",
  prepare: "juling-harness:desktop:chrome-updates-prepare",
  changed: "juling-harness:desktop:chrome-updates-changed",
} as const;

export type UpdateJobKind = "app" | "runtime";
export type UpdatePhase =
  | "resolving"
  | "downloading"
  | "verifying"
  | "extracting"
  | "installing"
  | "activating"
  | "awaiting-apply"
  | "done"
  | "failed"
  | "cancelled";

export interface UpdateProgressEvent {
  readonly jobId: string;
  readonly kind: UpdateJobKind;
  readonly phase: UpdatePhase;
  readonly step: number;
  readonly steps: number;
  readonly receivedBytes?: number | undefined;
  readonly totalBytes?: number | undefined;
  readonly bytesPerSecond?: number | undefined;
  readonly message?: string | undefined;
  /** Channel of the verified Runtime artifact, fixed for this job. */
  readonly runtimeChannel?: "stable" | "canary";
}

export interface UpdateCheckResult {
  readonly checkedAt: string;
  readonly app: {
    readonly currentVersion?: string | undefined;
    readonly bundledVersion?: string | undefined;
    readonly plan: "none" | "hot" | "full";
    readonly version?: string | undefined;
    readonly reason?: string | undefined;
    readonly sizeBytes?: number | undefined;
    readonly releaseNotesUrl?: string | undefined;
  };
  readonly runtime: {
    readonly plan: "none" | "available" | "blocked";
    readonly runtimeVersion?: string | undefined;
    readonly reason?: string | undefined;
    readonly sizeBytes?: number | undefined;
  };
  readonly error?: string | undefined;
}

export interface UpdateStartResult {
  readonly ok: boolean;
  readonly jobId?: string | undefined;
  readonly message?: string | undefined;
}

export interface UpdateImportResult {
  readonly ok: boolean;
  readonly jobId?: string | undefined;
  readonly cancelled?: boolean | undefined;
  readonly runtimeVersion?: string | undefined;
  readonly runtimeChannel?: "stable" | "canary";
  readonly message?: string | undefined;
}

export interface UpdateApplyResult {
  readonly ok: boolean;
  readonly deferred?: boolean | undefined;
  readonly message?: string | undefined;
}

export interface ChromeUpdatesCancelInput {
  readonly jobId: string;
}

export interface ChromeUpdatesImportInput {
  readonly kind: UpdateJobKind;
  readonly source: "file" | "directory";
}

export interface ChromeUpdatesPrefsSetInput {
  readonly mirrorPrefix?: string;
  readonly autoCheck?: boolean;
  readonly autoDownload?: boolean;
  readonly skippedAppVersion?: string;
  readonly runtimeChannel?: "stable" | "canary";
  readonly preferHotUpdate?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChromeUpdatesCancelInput(value: unknown): ChromeUpdatesCancelInput | undefined {
  if (!isRecord(value) || typeof value.jobId !== "string" || value.jobId.trim().length === 0) {
    return undefined;
  }
  return { jobId: value.jobId.trim() };
}

export function parseChromeUpdatesImportInput(value: unknown): ChromeUpdatesImportInput | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind !== "app" && value.kind !== "runtime") return undefined;
  if (value.source !== "file" && value.source !== "directory") return undefined;
  return { kind: value.kind, source: value.source };
}

export function parseChromeUpdatesPrefsSetInput(value: unknown): ChromeUpdatesPrefsSetInput | undefined {
  if (!isRecord(value)) return undefined;
  const result: {
    mirrorPrefix?: string;
    autoCheck?: boolean;
    autoDownload?: boolean;
    skippedAppVersion?: string;
    runtimeChannel?: "stable" | "canary";
    preferHotUpdate?: boolean;
  } = {};

  if (value.mirrorPrefix !== undefined) {
    if (typeof value.mirrorPrefix !== "string") return undefined;
    result.mirrorPrefix = value.mirrorPrefix;
  }
  if (value.autoCheck !== undefined) {
    if (typeof value.autoCheck !== "boolean") return undefined;
    result.autoCheck = value.autoCheck;
  }
  if (value.autoDownload !== undefined) {
    if (typeof value.autoDownload !== "boolean") return undefined;
    result.autoDownload = value.autoDownload;
  }
  if (value.skippedAppVersion !== undefined) {
    if (typeof value.skippedAppVersion !== "string") return undefined;
    result.skippedAppVersion = value.skippedAppVersion;
  }
  if (value.runtimeChannel !== undefined) {
    if (value.runtimeChannel !== "stable" && value.runtimeChannel !== "canary") return undefined;
    result.runtimeChannel = value.runtimeChannel;
  }
  if (value.preferHotUpdate !== undefined) {
    if (typeof value.preferHotUpdate !== "boolean") return undefined;
    result.preferHotUpdate = value.preferHotUpdate;
  }

  return result;
}

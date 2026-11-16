import { GUI_SETTING_KEYS, type GuiSettingsSnapshot } from "./gui-settings.js";
import type { SessionId } from "./ids.js";

/** Runtime settings intentionally exposed to the Harness Bridge. */
export const HARNESS_RUNTIME_SETTING_KEYS = [
  ...GUI_SETTING_KEYS,
  "modelRoles.judge",
  "claudeResets.autoRedeem5h",
  "claudeResets.autoRedeemWeekly",
  "claudeResets.autoRedeemFable",
  "claudeResets.minBlockedMinutes",
  "claudeResets.keepCredits",
  "claudeResets.salvageHorizonHours",
  "mcp.startupTimeoutMs",
  "ttsr.judge",
  "edit.autoRepair.enabled",
  "features.unexpectedStopDetection",
  "providers.unexpectedStopModel",
  "extendedContext",
  "compaction.asyncEnabled",
  "compaction.methodOrder",
  "providers.openai-codex.codeMode",
  "plan.autosave",
  "plan.autosaveDir",
  "retry.waitForUsageReset",
  "compaction.experimentalContextManagement",
  "task.enableEffort",
  "task.maxEffort",
  "task.agentServiceTierOverrides",
  "providers.autoThinkingMaxEffort",
  "providers.judgmentProvider",
  "images.describeForTextModels",
  "images.questionTimeoutMs",
  "tools.speculativeExecution.enabled",
] as const;

export type HarnessRuntimeSettingKey = (typeof HARNESS_RUNTIME_SETTING_KEYS)[number];

export const HARNESS_RUNTIME_UNEXPECTED_STOP_MODES = ["none", "mechanical", "smart"] as const;
export type HarnessRuntimeUnexpectedStopMode = (typeof HARNESS_RUNTIME_UNEXPECTED_STOP_MODES)[number];

export const HARNESS_RUNTIME_UNEXPECTED_STOP_MODELS = [
  "online",
  "qwen3-1.7b",
  "llama3.2:3b",
  "gemma-3-1b",
  "qwen2.5-1.5b",
  "lfm2-1.2b",
] as const;
export type HarnessRuntimeUnexpectedStopModel = (typeof HARNESS_RUNTIME_UNEXPECTED_STOP_MODELS)[number];

export const HARNESS_RUNTIME_COMPACTION_METHODS = [
  "remote",
  "snapcompact",
  "handoff",
  "soft",
  "shake",
] as const;
export type HarnessRuntimeCompactionMethod = (typeof HARNESS_RUNTIME_COMPACTION_METHODS)[number];

export const HARNESS_RUNTIME_CODE_MODES = ["off", "on", "auto"] as const;
export type HarnessRuntimeCodeMode = (typeof HARNESS_RUNTIME_CODE_MODES)[number];

/** Exact schema-backed public values; no arbitrary key/value escapes. */
export interface HarnessRuntimeSettingsSnapshot extends GuiSettingsSnapshot {
  "modelRoles.judge"?: string;
  "claudeResets.autoRedeem5h"?: "unset" | "yes" | "no";
  "claudeResets.autoRedeemWeekly"?: "unset" | "yes" | "no";
  "claudeResets.autoRedeemFable"?: "unset" | "yes" | "no";
  "claudeResets.minBlockedMinutes"?: number;
  "claudeResets.keepCredits"?: number;
  "claudeResets.salvageHorizonHours"?: number;
  "mcp.startupTimeoutMs"?: number;
  "ttsr.judge"?: "auto" | "on" | "off";
  "edit.autoRepair.enabled": boolean;
  "features.unexpectedStopDetection": HarnessRuntimeUnexpectedStopMode;
  /** Legacy Runtime snapshot compatibility; new Runtime uses modelRoles.judge. */
  "providers.unexpectedStopModel"?: HarnessRuntimeUnexpectedStopModel;
  extendedContext: boolean;
  "compaction.asyncEnabled": boolean;
  "compaction.methodOrder": HarnessRuntimeCompactionMethod[];
  "providers.openai-codex.codeMode": HarnessRuntimeCodeMode;
  "plan.autosave"?: boolean;
  "plan.autosaveDir"?: string;
  "retry.waitForUsageReset"?: boolean;
  "compaction.experimentalContextManagement"?: boolean;
  "task.enableEffort"?: boolean;
  "task.maxEffort"?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  "task.agentServiceTierOverrides"?: Record<string, "inherit" | "none" | "auto" | "default" | "flex" | "scale" | "priority" | "ultrafast">;
  "providers.autoThinkingMaxEffort"?: "xhigh" | "max";
  "providers.judgmentProvider"?: "auto" | "typesafe" | "llm";
  "images.describeForTextModels"?: boolean;
  "images.questionTimeoutMs"?: number;
  "tools.speculativeExecution.enabled"?: boolean;
}

export type HarnessRuntimeSettingValue = Exclude<HarnessRuntimeSettingsSnapshot[HarnessRuntimeSettingKey], undefined>;

export interface HarnessRuntimeSettingsActivation {
  sources?: Partial<Record<HarnessRuntimeSettingKey, "env" | "runtime" | "overlay" | "project" | "global" | "default">>;
  configured: Partial<HarnessRuntimeSettingsSnapshot>;
  restartRequired: HarnessRuntimeSettingKey[];
  hindsightCredential?: { configured: boolean; source: "env" | "runtime" | "overlay" | "project" | "global" | "default" };
  resolvedEditMode?: NonNullable<GuiSettingsSnapshot["edit.mode"]>;
}

type HarnessRuntimeSettingSetInputFor<K extends HarnessRuntimeSettingKey> = {
  key: K;
  value: Exclude<HarnessRuntimeSettingsSnapshot[K], undefined>;
  persist: boolean;
};

/** Correlated client input without the Runtime operation discriminant. */
export type HarnessRuntimeSettingSetInput = {
  [K in HarnessRuntimeSettingKey]: HarnessRuntimeSettingSetInputFor<K>;
}[HarnessRuntimeSettingKey];

/** Correlated key/value operation used by `runtime.settings.set`. */
export type HarnessRuntimeSettingSetOperation = {
  [K in HarnessRuntimeSettingKey]: HarnessRuntimeSettingSetInputFor<K> & {
    kind: "runtime.settings.set";
  };
}[HarnessRuntimeSettingKey];

export interface HarnessRuntimeSettingsGetResult {
  values: Partial<HarnessRuntimeSettingsSnapshot>;
  activation?: HarnessRuntimeSettingsActivation;
  hindsightStatus?: "ready" | "authentication-failed" | "not-found" | "unavailable" | "inactive";
}

export interface HarnessRuntimeSettingsSetResult {
  key: HarnessRuntimeSettingKey;
  value: HarnessRuntimeSettingValue;
  persisted: boolean;
  effectiveValue?: HarnessRuntimeSettingValue;
  restartRequired?: boolean;
}

export interface HarnessPlanSaveAndQuitResult {
  saved: true;
  path: string;
  exitedPlan: true;
  /** `failed` means save + Plan exit committed, but new-session creation threw. */
  newSession: "started" | "cancelled" | "failed";
  sessionId?: SessionId;
}

/** Runtime's optional snapshot-only speculation state. */
export type HarnessCompactionSpeculation = "idle" | "running" | "armed";

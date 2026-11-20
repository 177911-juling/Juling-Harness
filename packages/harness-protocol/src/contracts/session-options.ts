export type HarnessSpeed = "normal" | "fast" | "ultrafast" | "slow";
export type HarnessSettingScope = "default" | "env" | "global" | "project" | "overlay" | "runtime";
export interface SessionSpeedState {
  model: string | null;
  selected: HarnessSpeed;
  supported: HarnessSpeed[];
  effectiveTier?: string;
  fastActive: boolean;
  slowEnabled: boolean;
  slowScope?: "session" | "global";
  usageLimit?: { stage: "wrap_up" | "low_priority"; resetsAtSec?: number; allowanceLeftPercent?: number; extraUsage?: boolean };
}
export interface SessionWarmingState {
  mode: "off" | "streaming" | "idle";
  source: HarnessSettingScope;
  state: "unavailable" | "inactive" | "scheduled" | "refreshing";
  reason?: string;
  nextWarmAt?: number;
  decision?: { phase: "streaming" | "idle"; warmCost: number; missCost: number; expectedSavings: number; continuationProbability: number; economicsAvailable: boolean; action: "warm" | "stop" };
}
export interface ModelPresetRow {
  name: string; source: HarnessSettingScope; active: boolean;
  roles: Record<string, string>; thinking?: string; error?: string;
}
export interface ModelPresetResult {
  outcome: "saved" | "deleted" | "missing" | "project" | "switched" | "invalid" | "unavailable" | "failed";
  reason?: string; model?: string; thinking?: string;
  shadowed?: Array<{ role: string; expected?: string; actual?: string; source: HarnessSettingScope }>;
  shadowedThinking?: { expected: string; actual?: string; source: HarnessSettingScope };
  shadowOwner?: HarnessSettingScope;
}
export interface SessionBudgetState {
  treeSpent: number;
  warnCost: number | null;
  maxCost: number | null;
  limitReached: boolean;
  warnSource: HarnessSettingScope;
  maxSource: HarnessSettingScope;
}
export type SessionBudgetOperation =
  | { kind: "session.budget.get"; sessionId: string }
  | { kind: "session.budget.set"; sessionId: string; warnCost: number | null; maxCost: number | null; scope: "session" | "global" }
  | { kind: "session.budget.clearOverride"; sessionId: string };
export type SessionOptionsOperation =
  | SessionBudgetOperation
  | { kind: "session.speed.get"; sessionId: string }
  | { kind: "session.speed.set"; sessionId: string; expectedModel: string; speed: HarnessSpeed }
  | { kind: "session.warming.get"; sessionId: string }
  | { kind: "session.warming.set"; sessionId: string; mode: SessionWarmingState["mode"]; persist: boolean }
  | { kind: "models.presets.list"; sessionId: string }
  | { kind: "models.presets.save"; sessionId: string; name: string }
  | { kind: "models.presets.apply"; sessionId: string; name: string }
  | { kind: "models.presets.delete"; sessionId: string; name: string };
export interface SessionOptionsResultMap {
  "session.budget.get": SessionBudgetState;
  "session.budget.set": SessionBudgetState;
  "session.budget.clearOverride": SessionBudgetState;
  "session.speed.get": SessionSpeedState;
  "session.speed.set": SessionSpeedState;
  "session.warming.get": SessionWarmingState;
  "session.warming.set": SessionWarmingState;
  "models.presets.list": { presets: ModelPresetRow[] };
  "models.presets.save": ModelPresetResult;
  "models.presets.apply": ModelPresetResult;
  "models.presets.delete": ModelPresetResult;
}
export const SESSION_OPTIONS_KINDS = ["session.budget.get", "session.budget.set", "session.budget.clearOverride","session.speed.get", "session.speed.set", "session.warming.get", "session.warming.set", "models.presets.list", "models.presets.save", "models.presets.apply", "models.presets.delete"] as const;
export function isSessionOptionsKind(kind: string): kind is SessionOptionsOperation["kind"] { return (SESSION_OPTIONS_KINDS as readonly string[]).includes(kind); }

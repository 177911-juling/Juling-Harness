export interface HarnessIdaDatabase {
  id: string; ref: string; name: string; path: string; state: "opening" | "open";
  module: string; format: string; arch: string; bitness: number; busy: boolean; dirty: boolean;
  current?: { method: string; startedAt: number };
}
export interface HarnessIdaStatus {
  enabled: boolean; installDir: string; python: string; detectedInstall?: string; detectedPython?: string;
  available: boolean; reason?: string; databases: HarnessIdaDatabase[];
}
export type HarnessIdaOperation =
  | { kind: "ida.status.details"; sessionId: string }
  | { kind: "ida.configure"; sessionId: string; enabled: boolean; installDir: string; python: string }
  | { kind: "ida.open"; sessionId: string; path: string }
  | { kind: "ida.save"; sessionId: string; id: string }
  | { kind: "ida.close"; sessionId: string; id: string }
  | { kind: "ida.run"; sessionId: string; id: string; code: string; timeoutMs: number }
  | { kind: "ida.database.cancel"; sessionId: string; id: string };
export interface HarnessIdaResultMap {
  "ida.status.details": HarnessIdaStatus;
  "ida.configure": HarnessIdaStatus;
  "ida.open": { database: HarnessIdaDatabase };
  "ida.save": { saved: true; backup: string };
  "ida.close": { closed: true; backup: string };
  "ida.run": { output: string; value: string | null; error: string | null; truncated: boolean; backup: string; resultFile: string };
  "ida.database.cancel": { cancelled: boolean };
}
export const IDA_OPERATION_KINDS = ["ida.status.details", "ida.configure", "ida.open", "ida.save", "ida.close", "ida.run", "ida.database.cancel"] as const;
export function isIdaOperationKind(kind: string): kind is HarnessIdaOperation["kind"] { return (IDA_OPERATION_KINDS as readonly string[]).includes(kind); }

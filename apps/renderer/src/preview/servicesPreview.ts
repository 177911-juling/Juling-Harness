import type { HarnessServiceRow, HarnessServiceSpec } from "@juling-harness/harness-protocol";
export const PREVIEW_SERVICES: HarnessServiceRow[] = [
  { scope: "session", name: "web-dev", instanceId: "preview-web", state: "ready", startedAt: 1789000000000, readyAt: 1789000001200, restartCount: 0, outputBytes: 1840, mode: "session" },
  { scope: "project", name: "test-watch", instanceId: "preview-test", state: "running", startedAt: 1789000005000, restartCount: 1, outputBytes: 3920, mode: "session" },
  { scope: "global", name: "prediction", instanceId: "preview-predict", state: "ready", startedAt: 1789000000000, restartCount: 0, outputBytes: 320, mode: "session" },
];
export const PREVIEW_SERVICE_SPEC: HarnessServiceSpec = { name: "web-dev", command: "npm run dev", cwd: ".", pty: true, mode: "session", restart: "no", ready: { log: "ready", timeoutMs: 30000 } };

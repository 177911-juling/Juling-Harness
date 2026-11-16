import type { HarnessServiceRow, HarnessServiceSpec } from "@juling-harness/harness-protocol";
export const PREVIEW_SERVICES: HarnessServiceRow[] = [
  { name: "web-dev", instanceId: "preview-web", state: "ready", startedAt: 1789000000000, readyAt: 1789000001200, restartCount: 0, outputBytes: 1840, mode: "session" },
  { name: "test-watch", instanceId: "preview-test", state: "running", startedAt: 1789000005000, restartCount: 1, outputBytes: 3920, mode: "session" },
];
export const PREVIEW_SERVICE_SPEC: HarnessServiceSpec = { name: "web-dev", command: "npm run dev", cwd: ".", pty: true, mode: "session", restart: "no", ready: { log: "ready", timeoutMs: 30000 } };

import type {
  ClientInteraction,
  CommandReceipt,
  CommandRequestId,
  CommandState,
  SessionHistoryEntry,
  SessionId,
  HarnessClient,
  ThreadId,
} from "@juling-harness/client-contract";
import type { OperatorStateSnapshot } from "@juling-harness/harness-protocol";
import { waitReceipt } from "./hostError";

export const NEW_CONVERSATION_UNAVAILABLE_REASON =
  "Host 未提供 session.create，无法创建新的 Runtime 会话。";

export type NewSessionWaitResult =
  | { readonly ok: true; readonly sessionId?: SessionId }
  | { readonly ok: false; readonly error: string };

export function isNewConversationAvailable(): true {
  return true;
}

/** The single Host pending interaction, if exactly one command is waiting. */
export function selectPendingInteraction(
  commands: Readonly<Record<string, CommandState>>,
): ClientInteraction | null {
  const pending: ClientInteraction[] = [];
  for (const command of Object.values(commands)) {
    if (command.status === "interaction_required") {
      pending.push(command.interaction);
    }
  }
  if (pending.length === 0) return null;
  return pending[pending.length - 1] ?? null;
}

export type ResumeGenerationGate = {
  next(): number;
  isCurrent(generation: number): boolean;
};

export function createResumeGenerationGate(): ResumeGenerationGate {
  let current = 0;
  return {
    next() {
      current += 1;
      return current;
    },
    isCurrent(generation: number) {
      return generation === current;
    },
  };
}

export type CommandWaitClient = {
  subscribe(
    scope: { scope: "command"; requestId: CommandRequestId },
    listener: (event: { kind: string; receipt?: CommandReceipt }) => void,
  ): () => void;
  getState?: () => { readonly commands?: Readonly<Record<string, CommandState>> };
};

type RuntimeStateClient = HarnessClient & {
  onState?: (listener: () => void) => () => void;
  getState?: () => {
    readonly connection?: {
      readonly runtime?: { readonly status?: string } | null;
      readonly resyncRequired?: boolean;
    };
    readonly entities?: { readonly snapshot?: { readonly sessionId: string } | null };
  };
};

const RUNTIME_SNAPSHOT_WAIT_MS = 30_000;

/** The live client projection, not a React render, is the command precondition. */
export function runtimeSessionReady(client: HarnessClient, sessionId: string | undefined): boolean {
  const state = (client as RuntimeStateClient).getState?.();
  // Lightweight transport adapters predate the state projection. Their facade
  // remains authoritative; full Desktop/Web clients always expose both fields.
  if (state?.connection === undefined || state.entities === undefined) return true;
  const snapshot = state.entities.snapshot;
  return state.connection.runtime?.status === "connected"
    && state.connection.resyncRequired !== true
    && snapshot != null
    && (sessionId === undefined || snapshot.sessionId === sessionId);
}

/** Wait through create/rebind/auto-reconnect instead of racing the facade guard. */
export async function waitForRuntimeSession(client: HarnessClient, sessionId: string | undefined): Promise<void> {
  if (runtimeSessionReady(client, sessionId)) return;
  const stateful = client as RuntimeStateClient;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      if (error) reject(error); else resolve();
    };
    const check = () => { if (runtimeSessionReady(client, sessionId)) finish(); };
    const unsubscribe = stateful.onState?.(check) ?? client.subscribe({ scope: "all" }, check);
    timer = setTimeout(() => finish(new Error("等待 Runtime 会话快照就绪超时 / Timed out waiting for the Runtime session snapshot")), RUNTIME_SNAPSHOT_WAIT_MS);
    // The state can advance between the first check and listener registration.
    check();
  });
}

function terminalFromState(client: CommandWaitClient, requestId: CommandRequestId): CommandReceipt | undefined {
  const entry = client.getState?.()?.commands?.[requestId];
  if (entry === undefined) return undefined;
  if (entry.status === "completed" || entry.status === "failed" || entry.status === "rejected" || entry.status === "outcome_unknown") {
    return entry;
  }
  return undefined;
}

export function waitForCommandReceipt(
  client: CommandWaitClient,
  requestId: CommandRequestId,
): Promise<CommandReceipt> {
  const existing = terminalFromState(client, requestId);
  if (existing !== undefined) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const unsubscribe = client.subscribe({ scope: "command", requestId }, (event) => {
      if (event.kind !== "command.receipt" || event.receipt === undefined) return;
      unsubscribe();
      resolve(event.receipt);
    });
    const raced = terminalFromState(client, requestId);
    if (raced !== undefined) {
      unsubscribe();
      resolve(raced);
    }
  });
}

export async function resumeHistoryEntry(
  client: {
    command(name: "session.resume", input: { threadId: SessionHistoryEntry["threadId"] }): Promise<{ requestId: CommandRequestId }>;
    subscribe: CommandWaitClient["subscribe"];
  },
  entry: SessionHistoryEntry,
  gate: ResumeGenerationGate,
): Promise<{ generation: number; receipt: CommandReceipt }> {
  const generation = gate.next();
  const handle = await client.command("session.resume", { threadId: entry.threadId });
  const receipt = await waitForCommandReceipt(client, handle.requestId);
  return { generation, receipt };
}

export async function ensureSelectedSessionActive(
  client: HarnessClient,
  target: {
    readonly activeSessionId?: SessionId;
    readonly selectedSessionId?: SessionId;
    readonly selectedThreadId?: ThreadId;
  },
): Promise<void> {
  if (target.selectedSessionId !== undefined && target.activeSessionId !== target.selectedSessionId) {
    if (target.selectedThreadId === undefined) {
      throw { code: "INVALID_ARGUMENT", message: "当前历史会话缺少 threadId，无法自动恢复后发送。" };
    }
    const handle = await client.command("session.resume", { threadId: target.selectedThreadId });
    const snapshot = await waitReceipt<OperatorStateSnapshot>(client, handle.requestId, 30_000);
    if (snapshot.sessionId !== target.selectedSessionId) {
      throw {
        code: "STATE_VERSION_CONFLICT",
        message: `恢复后的会话与发送目标不一致：期望 ${target.selectedSessionId}，实际 ${snapshot.sessionId}。`,
      };
    }
  }
  await waitForRuntimeSession(client, target.selectedSessionId ?? target.activeSessionId);
}

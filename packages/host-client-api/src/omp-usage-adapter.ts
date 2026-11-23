/**
 * Homepage token-usage adapter.
 *
 * Syncs via the official `juling stats --summary` CLI (throttled), then reads
 * aggregates from ~/.juling/stats.db (falling back to the pre-rebrand
 * ~/.omp/stats.db). Paths, session files and folders never leave this module.
 * Opening the native dashboard spawns a hidden `juling stats` (not used as the
 * `usage.get` sync mechanism). On Windows the child is not detached — Node's
 * `detached: true` would create a console.
 */

import { execFile, spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import type { ConfigWriteResult, StatsDashboardReadModel, TokenUsageReadModel } from "@juling-harness/client-contract";

import { getStatsDbPathsForRead } from "./omp-discovery/paths.js";
import { hostText } from "./locale.js";
import { sanitizeDisplayText } from "./read-models.js";
import type { HostUsageService } from "./services.js";

const execFileAsync = promisify(execFile);

const OTHER_MODEL_ID = "其他";
const TOP_MODEL_COUNT = 5;
const DECISION_APIS = new Set([
  "typesafe", "openrouter-decisions", "workers-ai-systemone", "openai-decisions",
  "google-decisions", "liquid-systemone", "nace-systemone",
]);
const MODEL_ID_MAX = 64;
const SYNC_THROTTLE_MS = 30_000;
const SYNC_TIMEOUT_MS = 60_000;
const YEAR_LOOKBACK_DAYS = 400;

/** Preferred dashboard port; upstream's default, shared with the Juling Harness build. */
const DASHBOARD_PORT = 3847;
/**
 * Ports tried in order when the preferred one is held by another product. A
 * machine that runs Juling Harness alongside Harness keeps `omp stats` on 3847, and
 * that dashboard carries the same identity header while showing foreign data.
 */
const DASHBOARD_FALLBACK_PORTS: readonly number[] = [3848, 3849, 3850, 3851, 3852];
const dashboardUrlOf = (port: number): string => `http://127.0.0.1:${port}/`;
const DASHBOARD_PROBE_MS = 800;
/**
 * Deep link the statistics page embeds. The native client routes on the URL
 * hash and defaults to `24h`, which shows an empty page for anyone who has not
 * run OMP today; `all` is the range that always has data in this profile.
 */
const dashboardEmbedUrlOf = (port: number): string => `${dashboardUrlOf(port)}#/overview?range=all`;
/** A cold dashboard parses session tails before it can answer, so poll past that. */
const DASHBOARD_START_TIMEOUT_MS = 20_000;
const DASHBOARD_POLL_MS = 250;
/** Dashboard title the Harness fork ships; the identity check compares against it. */
const DASHBOARD_OWN_TITLE_MARKER = "Juling Harness";

const openOk = (): ConfigWriteResult => ({
  applied: true,
  runtimeEffect: "immediate",
  message: "正在打开 Juling Stats 仪表盘。",
});

const openedOk = (): ConfigWriteResult => ({
  applied: true,
  runtimeEffect: "immediate",
  message: "已在浏览器打开 Juling Stats 仪表盘。",
});

export interface OmpUsageAdapterOptions {
  readonly home?: string;
  readonly statsDbPath?: string;
  readonly locateOmp?: () => Promise<string | undefined>;
  readonly exec?: (exe: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  readonly spawnDashboard?: (exe: string, options?: { readonly open?: boolean; readonly port?: number }) => void;
  readonly openUrl?: (url: string) => Promise<void>;
  /** `true` only when this port answers with the Harness dashboard, not a look-alike. */
  readonly probeDashboard?: (port: number) => Promise<boolean>;
  /** `true` when anything answers HTTP on the port; injected so tests stay offline. */
  readonly probePortOccupied?: (port: number) => Promise<boolean>;
  readonly now?: () => number;
  readonly syncThrottleMs?: number;
  /** Injectable sleep so the startup poll runs instantly under test. */
  readonly delay?: (ms: number) => Promise<void>;
  /** How long a cold dashboard may take to answer before reporting unavailable. */
  readonly dashboardStartTimeoutMs?: number;
}

interface ModelDayRow {
  readonly date: string;
  readonly model: string;
  readonly tokens: number;
}

interface HourRow {
  readonly hour: number;
  readonly model: string;
  readonly tokens: number;
}

function emptyModel(generatedAt: string, reason?: string): TokenUsageReadModel {
  return {
    generatedAt,
    days: [],
    models: [],
    byModel: [],
    hours: [],
    ...(reason === undefined ? {} : { unavailableReason: reason }),
  };
}

function isoNow(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function localDate(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(ts: number): number {
  const date = new Date(ts);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function labelModel(raw: string): string {
  return sanitizeDisplayText(raw, MODEL_ID_MAX) ?? "unknown";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function defaultLocateOmp(): Promise<string | undefined> {
  // Canonical `juling` first; pre-rebrand `omp` binaries stay usable.
  const exeNames = process.platform === "win32" ? ["juling.exe", "omp.exe"] : ["juling", "omp"];
  const extraDirs = [
    join(homedir(), ".juling", "bin"),
    join(homedir(), ".omp", "bin"),
    join(homedir(), ".local", "bin"),
  ];
  const dirs = [...(process.env.PATH ?? "").split(delimiter), ...extraDirs];
  for (const exeName of exeNames) {
    for (const dir of dirs) {
      if (!dir) continue;
      const candidate = join(dir, exeName);
      if (await fileExists(candidate)) return candidate;
    }
  }
  const whereBin =
    process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe") : "which";
  for (const exeName of exeNames) {
    try {
      const { stdout } = await execFileAsync(whereBin, [exeName], { timeout: 8_000, windowsHide: true });
      const first = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
      if (first && (await fileExists(first))) return first;
    } catch {
      /* PATH walk already failed */
    }
  }
  return undefined;
}

/**
 * Start the native dashboard server.
 *
 * `open` decides whether `juling stats` may also launch the default browser.
 * The statistics page frames this dashboard, so an embedded start must not hand
 * the same panel to Edge/Chrome; the explicit 「在浏览器打开」 fallback still
 * must. The switch is an env var rather than a flag because an older Runtime
 * rejects unknown flags outright and would never start the server. Both the
 * canonical and pre-rebrand variable are set: runtimes that predate the
 * rebrand only read `OMP_STATS_NO_OPEN`.
 */
function defaultSpawnDashboard(
  exe: string,
  options?: { readonly open?: boolean; readonly port?: number },
): void {
  const args = ["stats"];
  if (options?.port !== undefined && options.port !== DASHBOARD_PORT) {
    // `juling stats` defaults to 3847; only pass the flag when we need another
    // port because another dashboard already owns the default one.
    args.push("--port", String(options.port));
  }
  const child = spawn(exe, args, {
    stdio: "ignore",
    windowsHide: true,
    ...(options?.open === true
      ? {}
      : { env: { ...process.env, JULING_STATS_NO_OPEN: "1", OMP_STATS_NO_OPEN: "1" } }),
    // On Windows, `detached: true` allocates a new console window.
    ...(process.platform === "win32" ? {} : { detached: true }),
  });
  child.unref();
}

/** Whether the served dashboard page belongs to this fork. */
export function isOwnDashboardHtml(html: string): boolean {
  return html.includes(`<title>${DASHBOARD_OWN_TITLE_MARKER}`);
}

/**
 * A live dashboard on this port must be *ours*. The identity header is shared
 * with the upstream Juling Harness build, so a machine running both products would
 * otherwise embed Juling Harness's panel — and its database — into this page.
 */
async function defaultProbeDashboard(port: number): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DASHBOARD_PROBE_MS);
  try {
    const response = await fetch(dashboardUrlOf(port), { method: "GET", signal: ac.signal });
    if (!response.ok || response.headers.get("x-omp-stats-dashboard") === null) return false;
    return isOwnDashboardHtml(await response.text());
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether anything answers HTTP on this port, ours or not. Spawning onto an
 * occupied port makes the dashboard fall back to an ephemeral one, which the
 * statistics page cannot frame, so the caller picks a genuinely free port first.
 */
async function defaultProbePortOccupied(port: number): Promise<boolean> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DASHBOARD_PROBE_MS);
  try {
    await fetch(dashboardUrlOf(port), { method: "GET", signal: ac.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function collapseModels(rows: ReadonlyArray<ModelDayRow>, yearStartDate: string): {
  models: string[];
  byModel: ModelDayRow[];
} {
  const yearTotals = new Map<string, number>();
  for (const row of rows) {
    if (row.date < yearStartDate) continue;
    yearTotals.set(row.model, (yearTotals.get(row.model) ?? 0) + row.tokens);
  }
  const ranked = [...yearTotals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const kept = new Set(ranked.slice(0, TOP_MODEL_COUNT).map(([id]) => id));
  const models = ranked.slice(0, TOP_MODEL_COUNT).map(([id]) => id);
  if (ranked.length > TOP_MODEL_COUNT) models.push(OTHER_MODEL_ID);

  const merged = new Map<string, number>();
  for (const row of rows) {
    const model = kept.has(row.model) ? row.model : OTHER_MODEL_ID;
    const key = `${row.date}\0${model}`;
    merged.set(key, (merged.get(key) ?? 0) + row.tokens);
  }
  const byModel: ModelDayRow[] = [];
  for (const [key, tokens] of merged) {
    const split = key.indexOf("\0");
    byModel.push({ date: key.slice(0, split), model: key.slice(split + 1), tokens });
  }
  byModel.sort((left, right) => left.date.localeCompare(right.date) || left.model.localeCompare(right.model));
  return { models, byModel };
}

function collapseHours(rows: ReadonlyArray<HourRow>, kept: ReadonlySet<string>, includeOther: boolean): HourRow[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const model = kept.has(row.model) ? row.model : includeOther ? OTHER_MODEL_ID : row.model;
    if (!kept.has(row.model) && !includeOther) continue;
    const key = `${row.hour}\0${model}`;
    merged.set(key, (merged.get(key) ?? 0) + row.tokens);
  }
  const hours: HourRow[] = [];
  for (const [key, tokens] of merged) {
    const split = key.indexOf("\0");
    hours.push({ hour: Number(key.slice(0, split)), model: key.slice(split + 1), tokens });
  }
  hours.sort((left, right) => left.hour - right.hour || left.model.localeCompare(right.model));
  return hours;
}

async function readUsageDb(dbPath: string, nowMs: number): Promise<TokenUsageReadModel | undefined> {
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync | undefined;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    return undefined;
  }
  if (DatabaseSync === undefined) return undefined;
  if (!(await fileExists(dbPath))) return undefined;

  let db: InstanceType<typeof import("node:sqlite").DatabaseSync> | undefined;
  try {
    db = new DatabaseSync(`file:${dbPath.replaceAll("\\", "/")}?mode=ro`, { readOnly: true });
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get();
    if (table === undefined) return undefined;

    const cutoff = nowMs - YEAR_LOOKBACK_DAYS * 86_400_000;
    const todayStart = startOfLocalDay(nowMs);
    const yearStartDate = `${new Date(nowMs).getFullYear()}-01-01`;

    const hasPurpose = db.prepare("PRAGMA table_info(messages)").all().some(column => column.name === "purpose");
    const dayRows = db
      .prepare(
        `SELECT timestamp AS timestamp, model AS model, total_tokens AS tokens
         FROM messages
         WHERE timestamp >= ?${hasPurpose ? " AND (purpose IS NULL OR purpose = 'discarded-turn')" : ""}`,
      )
      .all(cutoff) as Array<{ timestamp: number; model: string; tokens: number }>;

    const byDateTotal = new Map<string, number>();
    const modelDays: ModelDayRow[] = [];
    const hourRows: HourRow[] = [];
    const dayModelAcc = new Map<string, number>();

    for (const row of dayRows) {
      const ts = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp);
      const tokens = typeof row.tokens === "number" ? row.tokens : Number(row.tokens);
      if (!Number.isFinite(ts) || !Number.isFinite(tokens) || tokens <= 0) continue;
      const model = labelModel(typeof row.model === "string" ? row.model : "");
      const date = localDate(ts);
      byDateTotal.set(date, (byDateTotal.get(date) ?? 0) + tokens);
      const key = `${date}\0${model}`;
      dayModelAcc.set(key, (dayModelAcc.get(key) ?? 0) + tokens);
      if (ts >= todayStart && ts < todayStart + 86_400_000) {
        hourRows.push({ hour: new Date(ts).getHours(), model, tokens });
      }
    }

    for (const [key, tokens] of dayModelAcc) {
      const split = key.indexOf("\0");
      modelDays.push({ date: key.slice(0, split), model: key.slice(split + 1), tokens });
    }

    const collapsed = collapseModels(modelDays, yearStartDate);
    const kept = new Set(collapsed.models.filter((id) => id !== OTHER_MODEL_ID));
    const hours = collapseHours(hourRows, kept, collapsed.models.includes(OTHER_MODEL_ID));

    const days = [...byDateTotal.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([date, totalTokens]) => ({ date, totalTokens }));

    const sideChannels = hasPurpose ? db.prepare(
      "SELECT purpose, api, provider, model, COUNT(*) AS requests, SUM(total_tokens) AS tokens FROM messages WHERE timestamp >= ? AND purpose IS NOT NULL AND purpose != 'discarded-turn' GROUP BY purpose, api, provider, model",
    ).all(cutoff) : [];
    const totals = new Map<string, NonNullable<TokenUsageReadModel["offTranscript"]>[number]>();
    const decisions: NonNullable<TokenUsageReadModel["decisionModels"]>[number][] = [];
    for (const row of sideChannels) {
      const purpose = String(row.purpose);
      const base = purpose.split(":")[0]!;
      const kind = ["title", "title-fork", "title-drift"].includes(base) ? "title"
        : ["job-caption", "job-widget", "task-completion-probe"].includes(base) ? "jobCaption"
        : ["judge", "judge_batch"].includes(base) ? "judge"
        : base === "cache-warm" ? "cacheWarming" : undefined;
      const requests = Number(row.requests), tokens = Number(row.tokens);
      if (kind) {
        const previous = totals.get(kind);
        totals.set(kind, { kind, requests: requests + (previous?.requests ?? 0), tokens: tokens + (previous?.tokens ?? 0) });
      }
      if (typeof row.api === "string" && DECISION_APIS.has(row.api)) {
        decisions.push({ purpose: labelModel(purpose), provider: labelModel(String(row.provider)), model: labelModel(String(row.model)), requests, tokens });
      }
    }
    return {
      generatedAt: isoNow(nowMs),
      offTranscript: [...totals.values()],
      decisionModels: decisions.sort((a, b) => b.tokens - a.tokens).slice(0, 32),
      days,
      models: collapsed.models.map((id) => ({ id })),
      byModel: collapsed.byModel,
      hours,
    };
  } catch {
    return undefined;
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

export function createOmpUsageService(options: OmpUsageAdapterOptions = {}): HostUsageService {
  const home = options.home ?? homedir();
  const statsDbPaths = options.statsDbPath ? [options.statsDbPath] : getStatsDbPathsForRead(home);
  const locateOmp = options.locateOmp ?? defaultLocateOmp;
  const exec =
    options.exec ??
    (async (exe: string, args: string[]) => {
      const result = await execFileAsync(exe, args, { timeout: SYNC_TIMEOUT_MS, windowsHide: true });
      return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? ""), code: 0 };
    });
  const spawnDashboard = options.spawnDashboard ?? defaultSpawnDashboard;
  const openUrl = options.openUrl;
  const probeDashboard = options.probeDashboard ?? defaultProbeDashboard;
  const probeOccupied = options.probePortOccupied ?? defaultProbePortOccupied;
  const now = options.now ?? Date.now;
  const throttleMs = options.syncThrottleMs ?? SYNC_THROTTLE_MS;
  const delay = options.delay ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const startTimeoutMs = options.dashboardStartTimeoutMs ?? DASHBOARD_START_TIMEOUT_MS;
  /** Resolved once a dashboard answered; later calls skip the startup poll. */
  let dashboardUrl: string | undefined;
  let dashboardStarting: Promise<DashboardStart> | undefined;

  type DashboardStart = { readonly url: string } | { readonly reason: string };
  const dashboardPorts = [DASHBOARD_PORT, ...DASHBOARD_FALLBACK_PORTS];

  /**
   * Resolve a dashboard endpoint, starting one when nothing answers. A page
   * mount and the homepage card can ask at the same time, so concurrent callers
   * share one spawn instead of racing two servers onto the same port.
   *
   * Ports are tried in order because 3847 belongs to the upstream product too:
   * a Juling Harness dashboard there answers the shared identity header while
   * serving a different database, so the probe also checks the title and moves
   * to the next free port when it finds a foreign panel.
   */
  async function ensureDashboard(): Promise<DashboardStart> {
    // Always probe before answering: a panel that died after we first reached it
    // must not keep reporting "running" from a cached URL.
    for (const port of dashboardPorts) {
      if (await probeDashboard(port)) {
        dashboardUrl = dashboardEmbedUrlOf(port);
        return { url: dashboardUrl };
      }
    }
    dashboardUrl = undefined;
    if (dashboardStarting !== undefined) return dashboardStarting;
    dashboardStarting ??= (async (): Promise<DashboardStart> => {
      try {
        const exe = await locateOmp();
        if (exe === undefined) {
          return { reason: "未找到 Juling Runtime，无法启动本机统计面板。" };
        }
        // Pick the first port nobody is serving; an occupied one would make the
        // freshly spawned server fall back to an ephemeral port we can't frame.
        const freePort = (await Promise.all(dashboardPorts.map(async port => ({
          port,
          free: !(await probeOccupied(port)),
        })))).find(entry => entry.free)?.port;
        if (freePort === undefined) {
          return { reason: hostText("本机统计面板端口都被占用，请关闭其他 Stats 服务后重试。", "Every stats dashboard port is taken; close the other Stats server and retry.") };
        }
        spawnDashboard(exe, freePort === DASHBOARD_PORT ? undefined : { port: freePort });
        const deadline = now() + startTimeoutMs;
        // The clock is the primary budget, but a stalled or non-advancing clock
        // must never spin this loop forever: bound the attempts as well.
        const maxPolls = Math.max(1, Math.ceil(startTimeoutMs / DASHBOARD_POLL_MS) + 4);
        for (let poll = 0; poll < maxPolls && now() < deadline; poll += 1) {
          await delay(DASHBOARD_POLL_MS);
          if (await probeDashboard(freePort)) return { url: dashboardEmbedUrlOf(freePort) };
        }
        return { reason: hostText("本机统计面板未在预期时间内就绪，可稍后重试或在浏览器打开。", "The local stats dashboard did not become ready in time; retry shortly or open it in your browser.") };
      } catch {
        // A rejected locator or spawn must not leave the shared promise stuck.
        return { reason: hostText("启动本机统计面板失败。", "Failed to start the local stats dashboard.") };
      }
    })();
    const result = await dashboardStarting;
    dashboardStarting = undefined;
    if ("url" in result) dashboardUrl = result.url;
    return result;
  }

  let lastSyncAt = 0;
  let inflight: Promise<void> | undefined;

  async function syncOnce(): Promise<{ readonly ompPath?: string; readonly syncError?: string }> {
    // Cheap answers first: the throttle window and an in-flight sync need no
    // Runtime lookup at all. `locateOmp()` is cheap now that runtime evidence is
    // cached, but it is still a file probe on the 30 s poll — order it after the
    // decisions that can answer without it.
    const started = now();
    if (inflight) {
      await inflight;
      return {};
    }
    if (lastSyncAt > 0 && started - lastSyncAt < throttleMs) {
      return {};
    }
    const exe = await locateOmp();
    if (exe === undefined) {
      // Same `exe`-classified message as before the reorder: not finding the
      // Runtime still surfaces as a sync error, never as a generic read failure.
      return { syncError: "未找到 juling。安装 Juling 或将其加入 PATH 后即可同步用量。" };
    }
    // Re-check after the await: a concurrent caller may have started or finished
    // the sync while the locator was resolving. Keeping this check after the
    // await is what makes `syncOnce` single-flight.
    if (inflight) {
      await inflight;
      return { ompPath: exe };
    }
    if (lastSyncAt > 0 && started - lastSyncAt < throttleMs) {
      return { ompPath: exe };
    }
    inflight = (async () => {
      try {
        await exec(exe, ["stats", "--summary"]);
      } catch {
        /* keep going; an existing stats.db may still be readable */
      } finally {
        lastSyncAt = now();
        inflight = undefined;
      }
    })();
    await inflight;
    return { ompPath: exe };
  }

  return {
    async get(): Promise<TokenUsageReadModel> {
      const generatedAt = isoNow(now());
      const sync = await syncOnce();
      let model: TokenUsageReadModel | undefined;
      for (const statsDbPath of statsDbPaths) {
        model = await readUsageDb(statsDbPath, now());
        if (model !== undefined) break;
      }
      if (model !== undefined) {
        if (sync.syncError !== undefined && model.days.length === 0) {
          return { ...model, unavailableReason: sync.syncError };
        }
        return model;
      }
      if (sync.syncError !== undefined) {
        return emptyModel(generatedAt, sync.syncError);
      }
      const statsDbExists = (await Promise.all(statsDbPaths.map((path) => fileExists(path)))).some(Boolean);
      if (statsDbExists) {
        return emptyModel(generatedAt, "无法读取用量库。");
      }
      return emptyModel(generatedAt, "尚未同步到用量数据。可点击「打开 Juling Stats」生成统计库。");
    },

    async dashboard(): Promise<StatsDashboardReadModel> {
      const result = await ensureDashboard();
      return "url" in result ? { available: true, url: result.url } : { available: false, reason: result.reason };
    },

    async openDashboard(): Promise<ConfigWriteResult> {
      const exe = await locateOmp();
      if (exe === undefined) {
        throw { code: "UNAVAILABLE", message: "未找到 juling。安装 Juling 或将其加入 PATH 后再打开 Stats。" };
      }
      const livePort = (await Promise.all(dashboardPorts.map(async port => ({
        port,
        live: await probeDashboard(port),
      })))).find(entry => entry.live)?.port;
      if (livePort !== undefined && openUrl !== undefined) {
        try {
          await openUrl(dashboardUrlOf(livePort));
        } catch (error) {
          throw { code: "UNAVAILABLE", message: error instanceof Error ? error.message : "打开 Juling Stats 失败" };
        }
        return openedOk();
      }
      // An explicit request to see the panel in a browser keeps `juling stats`
      // opening one; only the embedded start suppresses it. Start on a free
      // port so a foreign dashboard is never opened as ours.
      const freePort = (await Promise.all(dashboardPorts.map(async port => ({
        port,
        free: !(await probeOccupied(port)),
      })))).find(entry => entry.free)?.port;
      if (freePort === undefined) {
        throw { code: "UNAVAILABLE", message: hostText("本机统计面板端口都被占用，请关闭其他 Stats 服务后重试。", "Every stats dashboard port is taken; close the other Stats server and retry.") };
      }
      try {
        spawnDashboard(exe, freePort === DASHBOARD_PORT ? { open: true } : { open: true, port: freePort });
      } catch (error) {
        throw { code: "UNAVAILABLE", message: error instanceof Error ? error.message : "打开 Juling Stats 失败" };
      }
      return openOk();
    },
  };
}

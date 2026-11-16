/**
 * Path resolution utilities — portable from omp-patch/vendor/oh-my-pi/packages/utils/src/dirs.ts
 * Supports profile-scoped agent dir, XDG redirects, and JULING_CONFIG_DIR /
 * JULING_CODING_AGENT_DIR overrides. The legacy `PI_*`/`OMP_*` variables and
 * the pre-rebrand `~/.omp` config root stay readable; canonical `.juling`
 * always wins and new writes always target it.
 */

import * as path from "node:path";
import * as fs from "node:fs";

/** Canonical config dir name (mirrors the vendor's `CONFIG_DIR_NAME`). */
const CONFIG_DIR_NAME = ".juling";
/** Pre-rebrand config dir name; read-only fallback. */
const LEGACY_CONFIG_DIR_NAME = ".omp";
/** Canonical app name for XDG roots (mirrors the vendor's `APP_NAME`). */
const APP_NAME = "juling";
/** Pre-rebrand app name for XDG roots; read-only fallback. */
const LEGACY_APP_NAME = "omp";

/**
 * Get the config directory name relative to home (e.g. ".juling", or an
 * override). `JULING_CONFIG_DIR` wins over the legacy `PI_CONFIG_DIR`.
 */
export function getConfigDirName(): string {
  return process.env.JULING_CONFIG_DIR || process.env.PI_CONFIG_DIR || CONFIG_DIR_NAME;
}

/**
 * Config dir names to read, highest priority first: the active config dir,
 * then the pre-rebrand `.omp` tree (dropped when the override already names
 * it). Mirrors the vendor's `config.ts` priority list.
 */
export function getConfigDirNames(): string[] {
  const canonical = getConfigDirName();
  return canonical === LEGACY_CONFIG_DIR_NAME ? [canonical] : [canonical, LEGACY_CONFIG_DIR_NAME];
}

function normalizeProfileName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed === "default") return undefined;
  return trimmed;
}

/**
 * `JULING_PROFILE` overrides the legacy `OMP_PROFILE`, which overrides the
 * older `PI_PROFILE`. An explicitly-empty canonical value selects the default
 * profile rather than inheriting a legacy value.
 */
function getActiveProfile(): string | undefined {
  try {
    return normalizeProfileName(
      process.env.JULING_PROFILE ?? process.env.OMP_PROFILE ?? process.env.PI_PROFILE
    );
  } catch {
    return undefined;
  }
}

/**
 * Get the base config root (~/.juling or profile-scoped ~/.juling/profiles/<name>).
 */
function getProfileConfigRoot(
  profile: string | undefined,
  home: string,
  configDirName: string
): string {
  const root = path.join(home, configDirName);
  return profile ? path.join(root, "profiles", profile) : root;
}

/**
 * Resolve XDG base directory for a given category (data / state / cache).
 */
function resolveXdgBase(
  envVar: string,
  appName: string,
  profile: string | undefined,
  home: string
): string | undefined {
  if (process.platform !== "linux" && process.platform !== "darwin") return undefined;
  const value = process.env[envVar];
  if (!value) return undefined;
  try {
    const appRoot = path.join(value, appName);
    if (profile) {
      const profilePath = path.join(appRoot, "profiles", profile);
      return fs.existsSync(profilePath) ? profilePath : undefined;
    }
    if (fs.existsSync(appRoot)) return appRoot;
  } catch {
    // unreadable XDG root — fall back to the config root
  }
  return undefined;
}

interface DirResolverOptions {
  readonly home: string;
  readonly configDirName: string;
  readonly appName: string;
  readonly agentDirOverride?: string | undefined;
  readonly profile?: string | undefined;
}

/**
 * Directory resolver with XDG awareness and profile support.
 */
class DirResolver {
  readonly configRoot: string;
  readonly agentDir: string;
  readonly home: string;

  readonly #rootDirs: { data: string; state: string; cache: string };
  readonly #agentDirs: { data: string; state: string; cache: string };

  constructor(options: DirResolverOptions) {
    this.home = options.home;
    const profile = normalizeProfileName(options.profile);
    this.configRoot = getProfileConfigRoot(profile, this.home, options.configDirName);

    const defaultAgent = path.join(this.configRoot, "agent");
    const agentDirOverride = profile ? undefined : options.agentDirOverride;
    this.agentDir = agentDirOverride ? path.resolve(agentDirOverride) : defaultAgent;
    const isDefault = this.agentDir === defaultAgent;

    let xdgData: string | undefined;
    let xdgState: string | undefined;
    let xdgCache: string | undefined;
    if (isDefault) {
      xdgData = resolveXdgBase("XDG_DATA_HOME", options.appName, profile, this.home);
      xdgState = resolveXdgBase("XDG_STATE_HOME", options.appName, profile, this.home);
      xdgCache = resolveXdgBase("XDG_CACHE_HOME", options.appName, profile, this.home);
    }

    this.#rootDirs = {
      data: xdgData ?? this.configRoot,
      state: xdgState ?? this.configRoot,
      cache: xdgCache ?? this.configRoot,
    };

    // XDG flattens the agent/ prefix: ~/.juling/agent/sessions → $XDG_DATA_HOME/juling/sessions
    this.#agentDirs = {
      data: xdgData ?? this.agentDir,
      state: xdgState ?? this.agentDir,
      cache: xdgCache ?? this.agentDir,
    };
  }

  rootSubdir(subdir: string, xdg?: "data" | "state" | "cache"): string {
    const base = xdg ? this.#rootDirs[xdg] : this.configRoot;
    return path.join(base, subdir);
  }

  agentSubdir(subdir: string, xdg?: "data" | "state" | "cache"): string {
    const base = xdg ? this.#agentDirs[xdg] : this.agentDir;
    return path.join(base, subdir);
  }
}

interface Resolvers {
  readonly home: string;
  readonly canonical: DirResolver;
  readonly legacy: DirResolver;
}

let cachedResolvers: Resolvers | undefined;

function getResolvers(home: string): Resolvers {
  if (!cachedResolvers || cachedResolvers.home !== home) {
    const profile = getActiveProfile();
    const agentDirOverride = profile
      ? undefined
      : process.env.JULING_CODING_AGENT_DIR || process.env.PI_CODING_AGENT_DIR || undefined;
    cachedResolvers = {
      home,
      canonical: new DirResolver({
        home,
        configDirName: getConfigDirName(),
        appName: APP_NAME,
        agentDirOverride,
        profile,
      }),
      legacy: new DirResolver({
        home,
        configDirName: LEGACY_CONFIG_DIR_NAME,
        appName: LEGACY_APP_NAME,
        profile,
      }),
    };
  }
  return cachedResolvers;
}

/**
 * Keep the candidates that exist, canonical first; fall back to the canonical
 * path when nothing exists yet so callers still get a write target.
 */
function existingCandidates(candidates: readonly string[]): string[] {
  const found: string[] = [];
  for (const candidate of candidates) {
    if (found.includes(candidate)) continue;
    try {
      if (fs.existsSync(candidate)) found.push(candidate);
    } catch {
      // unreadable candidate — skip it
    }
  }
  return found.length > 0 ? found : [candidates[0]!];
}

/**
 * Get the agent config directory (~/.juling/agent or profile/XDG-scoped).
 */
export function getAgentDir(home: string): string {
  return getResolvers(home).canonical.agentDir;
}

/**
 * Agent dirs to read, highest priority first: canonical `~/.juling/agent`,
 * then the pre-rebrand `~/.omp/agent` when it still exists.
 */
export function getAgentDirsForRead(home: string): string[] {
  const { canonical, legacy } = getResolvers(home);
  return existingCandidates([canonical.agentDir, legacy.agentDir]);
}

/**
 * Get the plugins directory (~/.juling/plugins or its XDG equivalent).
 */
export function getPluginsDir(home: string): string {
  return getResolvers(home).canonical.rootSubdir("plugins", "data");
}

/**
 * Plugin registry dirs to read, highest priority first: canonical
 * `~/.juling/plugins`, then the pre-rebrand `~/.omp/plugins`.
 */
export function getPluginsDirsForRead(home: string): string[] {
  const { canonical, legacy } = getResolvers(home);
  return existingCandidates([
    canonical.rootSubdir("plugins", "data"),
    legacy.rootSubdir("plugins", "data"),
  ]);
}

/**
 * Stats database paths to read, highest priority first: canonical
 * `~/.juling/stats.db`, then the pre-rebrand `~/.omp/stats.db`.
 */
export function getStatsDbPathsForRead(home: string): string[] {
  const { canonical, legacy } = getResolvers(home);
  return existingCandidates([
    canonical.rootSubdir("stats.db", "data"),
    legacy.rootSubdir("stats.db", "data"),
  ]);
}

/**
 * Get the project-local config directory (.juling).
 */
export function getProjectConfigDir(cwd: string): string {
  return path.join(cwd, getConfigDirName());
}

/**
 * Project-local config dirs to read, highest priority first: canonical
 * `.juling`, then the pre-rebrand `.omp`.
 */
export function getProjectConfigDirsForRead(cwd: string): string[] {
  return existingCandidates(getConfigDirNames().map((name) => path.join(cwd, name)));
}

/**
 * Shared OMP plugin root enumeration: user + project roots, npm ∪ lock
 * union, project shadowing and settings-declared extension directories.
 * `discoverPlugins` and the omp-plugins skill scan share this enumeration so
 * the two surfaces cannot drift apart.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDirsForRead, getPluginsDirsForRead, getProjectConfigDirsForRead } from "./paths.js";
import { parseManifest } from "./plugin-manifest.js";
import { resolveActiveProjectRegistryPaths } from "./helpers.js";
import type { DiscoveryWarning, PluginManifestView } from "./types.js";

export interface OmpPluginRoot {
  readonly name: string;
  /** Package dir (…/node_modules/<name>) */
  readonly root: string;
  /** package.json dependency spec, if any */
  readonly spec?: string;
  readonly version: string;
  readonly sourceKind: "npm" | "link" | "git" | "marketplace";
  readonly enabled: boolean;
  readonly scope: "user" | "project";
  readonly hasOmpManifest: boolean;
  readonly manifest: PluginManifestView;
}

export interface SettingsExtensionRoot {
  readonly path: string;
  readonly level: "user" | "project";
}

/** Classify plugin source kind from npm spec and marketplace flag. */
function classifyPluginSource(
  spec: string | undefined,
  marketplace: boolean
): "npm" | "marketplace" | "link" | "git" {
  if (marketplace) return "marketplace";
  const value = spec ?? "";
  if (/^(file:|\.|~[\\/]|[A-Za-z]:[\\/]|\/)/.test(value)) return "link";
  if (/^(github:|gitlab:|git\+|git@|https?:\/\/)/i.test(value)) return "git";
  return "npm";
}

/** Parse a JSON file; missing files and parse errors both yield undefined. */
async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function expandTilde(raw: string, home: string): string {
  if (raw === "~") return home;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return path.join(home, raw.slice(2));
  return raw;
}

/**
 * Enumerate plugin roots of one plugins directory: the union of
 * `package.json#dependencies` and `omp-plugins.lock.json#plugins`
 * (lock-only links are included), with enabled state from the lock and the
 * project overrides file.
 */
async function collectPluginsAtRoot(
  pluginsDir: string,
  scope: "user" | "project",
  disabled: ReadonlySet<string>,
  marketplaceNames: ReadonlySet<string>,
  warnings: DiscoveryWarning[]
): Promise<OmpPluginRoot[]> {
  const names = new Map<string, string>(); // name → dependency spec ("" for lock-only)
  const lockEnabled = new Map<string, boolean>();

  const pkg = asRecord(await readJson(path.join(pluginsDir, "package.json")));
  const deps = pkg ? asRecord(pkg.dependencies) : undefined;
  if (deps) {
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === "string") names.set(name, spec);
    }
  }

  const lock = asRecord(await readJson(path.join(pluginsDir, "omp-plugins.lock.json")));
  const lockPlugins = lock ? asRecord(lock.plugins) : undefined;
  if (lockPlugins) {
    for (const [name, state] of Object.entries(lockPlugins)) {
      if (!names.has(name)) names.set(name, "");
      const stateRecord = asRecord(state);
      if (stateRecord) lockEnabled.set(name, stateRecord.enabled !== false);
    }
  }

  const nodeModulesDir = path.join(pluginsDir, "node_modules");
  const roots: OmpPluginRoot[] = [];
  for (const [name, spec] of names) {
    const enabled = (lockEnabled.get(name) ?? true) && !disabled.has(name);
    const root = path.join(nodeModulesDir, ...name.split("/"));
    const pluginPkg = asRecord(await readJson(path.join(root, "package.json")));
    const ompManifest = pluginPkg ? (pluginPkg.omp ?? pluginPkg.pi) : undefined;

    roots.push({
      name,
      root,
      ...(spec ? { spec } : {}),
      version: pluginPkg && typeof pluginPkg.version === "string" ? pluginPkg.version : "0.0.0",
      sourceKind: classifyPluginSource(spec, marketplaceNames.has(name)),
      enabled,
      scope,
      hasOmpManifest: ompManifest !== undefined,
      manifest: parseManifest(ompManifest),
    });
  }
  return roots;
}

/**
 * List every OMP plugin root: the user plugins dir (`~/.juling/plugins`, then
 * legacy `~/.omp/plugins`) plus the project plugins dir anchored at the
 * nearest `.juling/` / `.omp/` / `.git/` above cwd. Higher-priority entries
 * shadow lower-priority ones with the same package name.
 */
export async function listOmpPluginRoots(home: string, cwd: string): Promise<{
  roots: OmpPluginRoot[];
  warnings: DiscoveryWarning[];
}> {
  const warnings: DiscoveryWarning[] = [];
  const pluginsDirs = getPluginsDirsForRead(home);

  // Names present in the user marketplace registries keep the npm/link
  // classification of dependencies that are also marketplace installs.
  const marketplaceNames = new Set<string>();
  for (const pluginsDir of pluginsDirs) {
    const installed = asRecord(await readJson(path.join(pluginsDir, "installed_plugins.json")));
    const installedPlugins = installed ? asRecord(installed.plugins) : undefined;
    if (!installedPlugins) continue;
    for (const id of Object.keys(installedPlugins)) {
      const atIndex = id.lastIndexOf("@");
      marketplaceNames.add(atIndex > 0 ? id.slice(0, atIndex) : id);
    }
  }

  // Project overrides come from `<cwd>/.juling/plugin-overrides.json` first,
  // then the pre-rebrand `<cwd>/.omp/plugin-overrides.json`.
  const disabled = new Set<string>();
  for (const configDir of getProjectConfigDirsForRead(cwd)) {
    const overrides = asRecord(await readJson(path.join(configDir, "plugin-overrides.json")));
    if (!overrides || !Array.isArray(overrides.disabled)) continue;
    for (const name of overrides.disabled) {
      if (typeof name === "string") disabled.add(name);
    }
  }

  // Highest priority first: project roots (canonical, then legacy) shadow user
  // roots (canonical, then legacy); first-seen name wins.
  const merged = new Map<string, OmpPluginRoot>();
  const projectPluginsDirs = (await resolveActiveProjectRegistryPaths(cwd)).map((registryPath) =>
    path.dirname(registryPath)
  );
  const candidates: Array<{ dir: string; scope: "user" | "project" }> = [
    ...projectPluginsDirs.map((dir) => ({ dir, scope: "project" as const })),
    ...pluginsDirs.map((dir) => ({ dir, scope: "user" as const })),
  ];
  for (const candidate of candidates) {
    const roots = await collectPluginsAtRoot(
      candidate.dir,
      candidate.scope,
      disabled,
      marketplaceNames,
      warnings
    );
    for (const root of roots) {
      if (merged.has(root.name)) continue;
      merged.set(root.name, root);
    }
  }
  return { roots: [...merged.values()], warnings };
}

async function readSettingsExtensions(settingsPath: string): Promise<string[]> {
  const parsed = asRecord(await readJson(settingsPath));
  if (!parsed || !Array.isArray(parsed.extensions)) return [];
  return parsed.extensions.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Resolve extension directories declared in `<cwd>/.juling/settings.json`
 * (project, then legacy `<cwd>/.omp/settings.json`) and
 * `getAgentDir(home)/settings.json` (user, canonical then legacy `~/.omp/agent`).
 * `~` is expanded against home; relative paths resolve against cwd; only
 * existing directories are returned. Project entries come first, first-seen wins.
 */
export async function listSettingsExtensionRoots(home: string, cwd: string): Promise<SettingsExtensionRoot[]> {
  const [projectSettings, userSettings] = await Promise.all([
    Promise.all(
      getProjectConfigDirsForRead(cwd).map((dir) => readSettingsExtensions(path.join(dir, "settings.json")))
    ),
    Promise.all(
      getAgentDirsForRead(home).map((dir) => readSettingsExtensions(path.join(dir, "settings.json")))
    ),
  ]);
  const projectExtensions = projectSettings.flat();
  const userExtensions = userSettings.flat();

  const seen = new Set<string>();
  const roots: SettingsExtensionRoot[] = [];
  const add = (raw: string, level: "user" | "project") => {
    const tilde = expandTilde(raw, home);
    const resolved = path.isAbsolute(tilde) ? tilde : path.resolve(cwd, tilde);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    roots.push({ path: resolved, level });
  };
  for (const raw of projectExtensions) add(raw, "project");
  for (const raw of userExtensions) add(raw, "user");

  const existing = await Promise.all(roots.map((root) => isDirectory(root.path)));
  return roots.filter((_, index) => existing[index]);
}

/**
 * Resolve the skill directories a plugin root contributes: the default
 * `<root>/skills` plus any paths declared in `.claude-plugin/plugin.json`
 * `skills` (string or string[]). Declared paths must stay inside the plugin
 * root; escaping entries are dropped with a warning.
 */
export async function resolvePluginSkillDirs(
  pluginRoot: string,
  warnings: DiscoveryWarning[]
): Promise<string[]> {
  const dirs = [path.join(pluginRoot, "skills")];

  const parsed = asRecord(await readJson(path.join(pluginRoot, ".claude-plugin", "plugin.json")));
  if (!parsed) return dirs;

  const raw = parsed.skills;
  const declared =
    typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : [];

  const seen = new Set<string>(dirs);
  for (const entry of declared) {
    const abs = path.resolve(pluginRoot, entry);
    if (path.relative(pluginRoot, abs).startsWith("..")) {
      warnings.push({
        message: `Ignoring skills path outside plugin root for ${path.basename(pluginRoot)}: ${entry}`,
      });
      continue;
    }
    if (seen.has(abs)) continue;
    seen.add(abs);
    dirs.push(abs);
  }
  return dirs;
}

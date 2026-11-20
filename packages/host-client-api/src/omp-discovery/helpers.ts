/**
 * Discovery helpers — ancestor traversal, skill scanning, plugin registry stack.
 * Portable from omp-patch/vendor/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts
 */

import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parseFrontmatter } from "./frontmatter.js";
import { getConfigDirNames, getPluginsDirsForRead } from "./paths.js";
import type { DiscoveredSkill, DiscoveryWarning } from "./types.js";

/**
 * Read a file, returning undefined if ENOENT.
 */
async function readFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Check if a path exists and is a directory.
 */
async function isDirectory(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Walk up from cwd to repoRoot (or home), returning ancestor directories.
 * User home is excluded: ~/.agent is user-level, not project-level.
 */
function getAncestorDirs(cwd: string, repoRoot: string | undefined, home: string): string[] {
  const dirs: string[] = [];
  let current = cwd;
  const stopAt = repoRoot ?? home;

  while (true) {
    if (current !== home) {
      dirs.push(current);
    }
    if (current === stopAt) break;
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return dirs;
}

/**
 * Find the nearest .git directory by walking up from cwd.
 */
export async function findRepoRoot(cwd: string, home: string): Promise<string | undefined> {
  let current = cwd;
  while (current !== home) {
    if (await isDirectory(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

export interface ScanSkillsOptions {
  /** Directory to scan */
  readonly dir: string;
  /** Provider id (native, omp-plugins, claude, etc.) */
  readonly providerId: string;
  /** Provider priority (higher wins on collision) */
  readonly priority: number;
  /** Scope classification */
  readonly scope: "workspace" | "global" | "builtin";
  /** Source kind */
  readonly sourceKind: "native" | "plugin" | "managed";
  /** Source label for display */
  readonly sourceLabel: string;
  /** Include SKILL.md directly under dir (not just subdirs) */
  readonly includeSelf?: boolean;
  /** Drop skills missing description */
  readonly requireDescription?: boolean;
}

/**
 * Scan a directory for SKILL.md files (one per subdirectory, or optionally at dir itself).
 * Mirrors OMP's scanSkillsFromDir logic.
 */
export async function scanSkillsFromDir(
  options: ScanSkillsOptions
): Promise<{ skills: DiscoveredSkill[]; warnings: DiscoveryWarning[] }> {
  const {
    dir,
    providerId,
    priority,
    scope,
    sourceKind,
    sourceLabel,
    includeSelf = false,
    requireDescription = false,
  } = options;

  const skills: DiscoveredSkill[] = [];
  const warnings: DiscoveryWarning[] = [];

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      warnings.push({ message: `Failed to read skills directory: ${dir}`, providerId });
    }
    return { skills, warnings };
  }

  const loadSkill = async (skillPath: string) => {
    try {
      const content = await readFile(skillPath);
      if (!content) return;

      const { frontmatter } = parseFrontmatter(content, { source: skillPath });

      // Disabled skills stay listed as inventory (enabled: false) so the UI
      // can re-enable them; only requireDescription still drops entries.
      if (requireDescription && !frontmatter.description) return;

      const skillDirName = path.basename(path.dirname(skillPath));
      const rawName = frontmatter.name;
      const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : skillDirName;

      skills.push({
        name,
        description: typeof frontmatter.description === "string" ? frontmatter.description : "",
        path: skillPath,
        scope,
        sourceKind,
        sourceLabel,
        providerId,
        priority,
        enabled: frontmatter.enabled !== false,
        hide: frontmatter.hide === true,
        disableModelInvocation:
          frontmatter.disableModelInvocation === true ||
          frontmatter["disable-model-invocation"] === true,
        frontmatter,
      });
    } catch {
      warnings.push({ message: `Failed to read skill file: ${skillPath}`, providerId });
    }
  };

  const work: Promise<void>[] = [];

  if (includeSelf) {
    const selfSkillPath = path.join(dir, "SKILL.md");
    try {
      await fs.access(selfSkillPath);
      work.push(loadSkill(selfSkillPath));
    } catch {
      // no SKILL.md at dir level
    }
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillPath = path.join(dir, entry.name, "SKILL.md");
    try {
      await fs.access(skillPath);
      work.push(loadSkill(skillPath));
    } catch {
      // no SKILL.md in this subdir
    }
  }

  await Promise.all(work);

  // Async reads complete out of order; sort so output is stable across runs.
  skills.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) return nameCompare;
    return a.path.localeCompare(b.path);
  });

  return { skills, warnings };
}

/**
 * Resolve the nearest config directory (`.juling` first, then legacy `.omp`)
 * by walking up from cwd, stopping before home. Pass 2 anchors on `.git` when
 * no config dir exists yet.
 */
async function findProjectConfigDir(cwd: string, configDirName: string): Promise<string | undefined> {
  const homeDir = os.homedir();

  let dir = path.resolve(cwd);
  while (dir !== homeDir) {
    const candidate = path.join(dir, configDirName);
    if (await isDirectory(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }

  dir = path.resolve(cwd);
  while (dir !== homeDir) {
    if (await isDirectory(path.join(dir, ".git"))) {
      return path.join(dir, configDirName);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
}

/**
 * Resolve project plugin registries by priority: canonical `.juling` first,
 * then the pre-rebrand `.omp` tree. Returns the `installed_plugins.json`
 * paths that exist, highest priority first.
 */
export async function resolveActiveProjectRegistryPaths(cwd: string): Promise<string[]> {
  const results: string[] = [];
  for (const configDirName of getConfigDirNames()) {
    const configDir = await findProjectConfigDir(cwd, configDirName);
    if (!configDir) continue;
    const registryPath = path.join(configDir, "plugins", "installed_plugins.json");
    if (await isDirectory(path.dirname(registryPath))) results.push(registryPath);
  }
  return results;
}

/**
 * Highest-priority project plugin registry path, or undefined.
 */
export async function resolveActiveProjectRegistryPath(cwd: string): Promise<string | undefined> {
  const [first] = await resolveActiveProjectRegistryPaths(cwd);
  return first;
}

export interface ClaudePluginRoot {
  readonly id: string; // "plugin-name@marketplace"
  readonly marketplace: string;
  readonly plugin: string;
  readonly version: string;
  readonly path: string;
  readonly scope: "user" | "project";
  /** Registry `enabled` state; disabled installs stay listed as inventory. */
  readonly enabled: boolean;
}

interface ClaudePluginsRegistry {
  plugins: Record<
    string,
    Array<{
      installPath?: string;
      version?: string;
      enabled?: boolean;
      scope?: string;
      projectPath?: string;
    }>
  >;
}

function parseClaudePluginsRegistry(content: string): ClaudePluginsRegistry | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as { plugins?: unknown }).plugins === "object"
    ) {
      return parsed as ClaudePluginsRegistry;
    }
  } catch {
    // malformed JSON — caller reports a warning
  }
  return null;
}

async function canonicalPath(p: string): Promise<string | null> {
  try {
    return await fs.realpath(path.resolve(p));
  } catch {
    return null;
  }
}

/**
 * List Claude marketplace plugin roots from the registry stack, highest
 * priority last so later registries shadow earlier ones per plugin ID:
 * 1. ~/.claude/plugins/installed_plugins.json
 * 2. ~/.omp/plugins/installed_plugins.json (pre-rebrand tree)
 * 3. ~/.juling/plugins/installed_plugins.json (canonical, shadows the above)
 * 4. Nearest project `.juling`/`.omp` plugins/installed_plugins.json (shadows user)
 *
 * Mirrors the vendor's listClaudePluginRoots logic and priority list.
 */
export async function listClaudePluginRoots(
  home: string,
  cwd?: string
): Promise<{ roots: ClaudePluginRoot[]; warnings: DiscoveryWarning[] }> {
  const roots: ClaudePluginRoot[] = [];
  const warnings: DiscoveryWarning[] = [];
  const projectRoots: ClaudePluginRoot[] = [];

  const resolvedProjectPaths = cwd ? await resolveActiveProjectRegistryPaths(cwd) : [];
  const [nearestProjectRegistry] = resolvedProjectPaths;
  const projectRoot = nearestProjectRegistry
    ? path.dirname(path.dirname(path.dirname(nearestProjectRegistry)))
    : cwd;
  const activeProjectCanonical = projectRoot ? await canonicalPath(projectRoot) : null;
  const canonicalCache = new Map<string, string | null>();

  /**
   * Append a plugin registry, dropping lower-priority roots for the same
   * plugin ID so the caller can apply registries from lowest to highest.
   */
  const applyRegistry = (
    content: string,
    registryPath: string,
    target: ClaudePluginRoot[],
    forceScope: "user" | "project" | undefined,
    parseFailure: string
  ): void => {
    const registry = parseClaudePluginsRegistry(content);
    if (!registry) {
      warnings.push({ message: `${parseFailure}: ${registryPath}` });
      return;
    }
    for (const [pluginId, entries] of Object.entries(registry.plugins)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;
      const atIndex = pluginId.lastIndexOf("@");
      if (atIndex === -1) {
        warnings.push({ message: `Invalid plugin ID format (missing @marketplace): ${pluginId}` });
        continue;
      }
      const pluginName = pluginId.slice(0, atIndex);
      const marketplace = pluginId.slice(atIndex + 1);

      const filtered = target.filter((r) => r.id !== pluginId);
      target.length = 0;
      target.push(...filtered);

      for (const entry of entries) {
        if (!entry.installPath || typeof entry.installPath !== "string") {
          warnings.push({ message: `Plugin ${pluginId} entry has no installPath` });
          continue;
        }
        if (target.some((r) => r.id === pluginId && r.path === entry.installPath)) continue;

        target.push({
          id: pluginId,
          marketplace,
          plugin: pluginName,
          version: entry.version || "unknown",
          path: entry.installPath,
          scope: forceScope ?? (entry.scope === "local" ? "project" : "user"),
          enabled: entry.enabled !== false,
        });
      }
    }
  };

  // 1. Claude Code registry (~/.claude/plugins/installed_plugins.json)
  const claudeRegistryPath = path.join(home, ".claude", "plugins", "installed_plugins.json");
  const claudeContent = await readFile(claudeRegistryPath);
  if (claudeContent) {
    const registry = parseClaudePluginsRegistry(claudeContent);
    if (!registry) {
      warnings.push({
        message: `Failed to parse Claude Code plugin registry: ${claudeRegistryPath}`,
      });
    } else {
      for (const [pluginId, entries] of Object.entries(registry.plugins)) {
        if (!Array.isArray(entries) || entries.length === 0) continue;
        const atIndex = pluginId.lastIndexOf("@");
        if (atIndex === -1) {
          warnings.push({ message: `Invalid plugin ID format (missing @marketplace): ${pluginId}` });
          continue;
        }
        const pluginName = pluginId.slice(0, atIndex);
        const marketplace = pluginId.slice(atIndex + 1);

        for (const entry of entries) {
          if (!entry.installPath || typeof entry.installPath !== "string") {
            warnings.push({ message: `Plugin ${pluginId} entry has no installPath` });
            continue;
          }

          // Scope "local" entries only apply inside their own project.
          if (entry.scope === "local") {
            if (!entry.projectPath || !activeProjectCanonical) continue;
            let entryCanonical = canonicalCache.get(entry.projectPath);
            if (entryCanonical === undefined) {
              entryCanonical = await canonicalPath(entry.projectPath);
              canonicalCache.set(entry.projectPath, entryCanonical);
            }
            if (entryCanonical !== activeProjectCanonical) continue;
          }

          roots.push({
            id: pluginId,
            marketplace,
            plugin: pluginName,
            version: entry.version || "unknown",
            path: entry.installPath,
            scope: entry.scope === "local" ? "project" : "user",
            enabled: entry.enabled !== false,
          });
        }
      }
    }
  }

  // 2. Juling plugin registries: legacy `.omp` first, then canonical `.juling`,
  // so the canonical tree shadows the pre-rebrand one and both shadow Claude.
  for (const pluginsDir of getPluginsDirsForRead(home).reverse()) {
    const registryPath = path.join(pluginsDir, "installed_plugins.json");
    const content = await readFile(registryPath);
    if (content) {
      applyRegistry(content, registryPath, roots, undefined, "Failed to parse Juling plugin registry");
    }
  }

  // 3. Project registries (nearest .juling/plugins, then legacy .omp/plugins) — shadow user
  for (const registryPath of [...resolvedProjectPaths].reverse()) {
    const content = await readFile(registryPath);
    if (content) {
      applyRegistry(content, registryPath, projectRoots, "project", "Failed to parse project plugin registry");
    }
  }

  // Project entries shadow user entries for the same plugin ID
  if (projectRoots.length > 0) {
    const projectIds = new Set(projectRoots.map((r) => r.id));
    const deduped = roots.filter((r) => !projectIds.has(r.id));
    roots.length = 0;
    roots.push(...projectRoots, ...deduped);
  }

  return { roots, warnings };
}

export { getAncestorDirs };

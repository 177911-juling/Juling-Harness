/**
 * Agent-home resolution and the one-time pre-rebrand `~/.omp` → `~/.juling`
 * migration.
 *
 * The migration is best-effort and never destructive: when a rename fails
 * (cross-device moves, Windows locks/EPERM) the tree is copied recursively and
 * the legacy directory is left untouched, so no user data can be lost. A copy
 * that also fails leaves the legacy tree as the resolved root and reports the
 * failure instead of throwing.
 */

import { cp, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Canonical per-user agent home directory name. */
export const AGENT_HOME_DIR_NAME = ".juling";
/** Pre-rebrand per-user agent home directory name; migratable and readable. */
export const LEGACY_AGENT_HOME_DIR_NAME = ".omp";

export interface AgentHomeMigrationResult {
  /** Agent home that reads should use after the attempt. */
  readonly root: string;
  /** True when this call moved or copied the legacy tree into `root`. */
  readonly migrated: boolean;
  /** Legacy tree when it is still present (kept on failure, or left by a copy). */
  readonly legacy?: string;
  /** Failure detail when neither rename nor copy succeeded. */
  readonly error?: string;
}

/**
 * Agent directory override, canonical first: `JULING_AGENT_DIR`, then the
 * pre-rebrand `OMP_AGENT_DIR`, then the vendor's `PI_CODING_AGENT_DIR`.
 */
export function resolveAgentDirOverride(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = environment.JULING_AGENT_DIR || environment.OMP_AGENT_DIR || environment.PI_CODING_AGENT_DIR;
  return value !== undefined && value.length > 0 ? value : undefined;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Copy the legacy tree into a staging directory, then publish it with a single
 * rename, so a partial copy never becomes the canonical root and the legacy
 * tree is untouched until the copy is complete.
 */
async function copyAgentHome(source: string, destination: string): Promise<void> {
  const staging = `${destination}.migrating`;
  await rm(staging, { recursive: true, force: true });
  await cp(source, staging, { recursive: true, force: false, errorOnExist: false });
  if (!(await isDirectory(staging))) throw new Error(`copy produced no directory at ${staging}`);
  await rename(staging, destination);
}

/**
 * Migrate `~/.omp` to `~/.juling` once per machine.
 *
 * - Both present: canonical wins, the legacy tree is reported and left as-is.
 * - Only legacy: renamed when possible; otherwise copied recursively and the
 *   legacy tree is left in place (never deleted on failure).
 * - Neither / canonical only: no-op.
 *
 * Idempotent and never throws; failures surface through `error`.
 */
export async function migrateLegacyAgentHome(home: string = homedir()): Promise<AgentHomeMigrationResult> {
  const root = join(home, AGENT_HOME_DIR_NAME);
  const legacy = join(home, LEGACY_AGENT_HOME_DIR_NAME);

  if (!(await isDirectory(legacy))) return { root, migrated: false };
  if (await isDirectory(root)) return { root, migrated: false, legacy };

  try {
    await rename(legacy, root);
    return { root, migrated: true };
  } catch (error) {
    try {
      await copyAgentHome(legacy, root);
      return { root, migrated: true, legacy };
    } catch (copyError) {
      const renameMessage = error instanceof Error ? error.message : String(error);
      const copyMessage = copyError instanceof Error ? copyError.message : String(copyError);
      return {
        root: legacy,
        migrated: false,
        legacy,
        error: `rename failed (${renameMessage}); copy failed (${copyMessage})`,
      };
    }
  }
}

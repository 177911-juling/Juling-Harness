import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { LEGACY_RUNTIME_ENTRYPOINTS, RUNTIME_ENTRYPOINTS, runtimeEntrypointFor, runtimeLegacyEntrypointFor, type AnyRuntimeEntrypoint } from "./runtime-platform.js";

/** Windows layout; `runtimeArchiveFiles` gives the layout for any entrypoint. */
export const RUNTIME_ARCHIVE_FILES = ["checksums.json", "juling.exe", "runtime-manifest.json", "runtime-signature.json"] as const;
/** Fixed (sorted) order keeps block reuse stable across releases. */
export function runtimeArchiveFiles(entrypoint: AnyRuntimeEntrypoint): readonly string[] {
  return ["checksums.json", entrypoint, "runtime-manifest.json", "runtime-signature.json"];
}
/** Canonical and pre-rename entrypoint names, keyed for membership checks. */
const ENTRYPOINT_NAMES: Readonly<Record<string, true>> = Object.freeze(
  Object.fromEntries([...Object.values(RUNTIME_ENTRYPOINTS), ...Object.values(LEGACY_RUNTIME_ENTRYPOINTS)].map((name) => [name, true] as const)),
);
const METADATA_NAMES: Readonly<Record<string, true>> = Object.freeze({ "checksums.json": true, "runtime-manifest.json": true, "runtime-signature.json": true });
const MAX_ARCHIVE = 768 * 1024 * 1024;

/**
 * The archive's entrypoint name, which is also the member name. Archives signed
 * before the product rename keep their `omp.exe`/`omp` member: the manifest is
 * the source of truth, so the old name is accepted here and never rewritten.
 */
function manifestEntrypoint(value: unknown): AnyRuntimeEntrypoint {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (typeof record.platform !== "string" || typeof record.entrypoint !== "string") throw new Error("Runtime archive manifest lacks platform or entrypoint");
  const { canonical, legacy } = platformEntrypointNames(record.platform);
  if (record.entrypoint !== canonical && record.entrypoint !== legacy) throw new Error(`Runtime archive entrypoint ${record.entrypoint} does not match ${record.platform}`);
  return record.entrypoint === legacy ? legacy : canonical;
}
function platformEntrypointNames(platform: string): { canonical: AnyRuntimeEntrypoint; legacy: AnyRuntimeEntrypoint } {
  try {
    return { canonical: runtimeEntrypointFor(platform), legacy: runtimeLegacyEntrypointFor(platform) };
  } catch { throw new Error(`Runtime archive platform ${platform} is unsupported`); }
}
function parseManifest(bytes: Uint8Array): unknown {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { throw new Error("Runtime archive manifest is not valid JSON"); }
}
function isFinderMetadata(name: string): boolean {
  return name.startsWith("__MACOSX/") || /(?:^|\/)(?:\.DS_Store|\._[^/]*)$/.test(name);
}

/** Fixed order, fixed timestamps and STORE preserve binary block reuse. */
export async function createRuntimeArchive(directory: string, destination: string): Promise<void> {
  const entrypoint = manifestEntrypoint(parseManifest(await readFile(join(directory, "runtime-manifest.json"))));
  const entries: Record<string, Uint8Array> = {};
  for (const name of runtimeArchiveFiles(entrypoint)) entries[name] = await readFile(join(directory, name));
  await writeFile(destination, zipSync(entries, { level: 0, mtime: new Date(1980, 0, 1), os: 0 }));
}
export async function extractRuntimeArchive(archive: string, destination: string): Promise<void> {
  if ((await stat(archive)).size > MAX_ARCHIVE) throw new Error("Runtime archive too large");
  const bytes = await readFile(archive);
  if (bytes.length > MAX_ARCHIVE) throw new Error("Runtime archive too large");
  let count = 0, total = 0, entrypoint: string | undefined;
  const seen = new Set<string>();
  const entries = unzipSync(bytes, { filter: (entry) => {
    if (isFinderMetadata(entry.name)) throw new Error(`Runtime archive contains Finder metadata ${entry.name}`);
    const isEntrypoint = Object.hasOwn(ENTRYPOINT_NAMES, entry.name);
    if ((!isEntrypoint && !Object.hasOwn(METADATA_NAMES, entry.name)) || seen.has(entry.name) || entry.compression !== 0) throw new Error("Unexpected Runtime archive entry");
    if (isEntrypoint) {
      if (entrypoint !== undefined) throw new Error("Runtime archive has more than one entrypoint");
      entrypoint = entry.name;
    }
    seen.add(entry.name); count++; total += entry.originalSize;
    if (count > 4 || total > MAX_ARCHIVE || entry.originalSize !== entry.size) throw new Error("Invalid Runtime archive size");
    return true;
  } });
  if (count !== 4 || entrypoint === undefined) throw new Error("Incomplete Runtime archive");
  const expected = manifestEntrypoint(parseManifest(entries["runtime-manifest.json"]!));
  if (expected !== entrypoint) throw new Error("Runtime archive entrypoint does not match its manifest");
  await mkdir(destination, { recursive: true });
  for (const name of runtimeArchiveFiles(expected)) await writeFile(join(destination, name), entries[name]!, { flag: "wx" });
  // Zip entries carry no mode bits (os: 0); a POSIX Runtime must be executable for its self-check.
  if (!expected.endsWith(".exe")) await chmod(join(destination, expected), 0o755);
}

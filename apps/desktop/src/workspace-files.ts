import { lstat, mkdir, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  WorkspaceFileMutationResult,
  WorkspaceFileNode,
  WorkspaceFileTreeReadModel,
  WorkspaceId,
  WorkspaceFileInfo, WorkspaceFileTarget,
} from "@juling-harness/client-contract";
import type { HostWorkspaceFileService } from "@juling-harness/host-client-api";
import type { WorkspaceRegistry } from "@juling-harness/harness-host";
import { desktopText } from "./desktop-language-shared.js";

const MAX_DIRECTORY_ENTRIES = 5_000;
const IGNORED = new Set([".git", "node_modules"]);
export { FILE_CHUNK_BYTES, EDITABLE_FILE_BYTES, fileMime as workspaceFileMime } from "./file-io.js";
import { inspectFile, readFileText, readFileChunk, writeFileText } from "./file-io.js";

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("workspace file path must be relative");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw new Error("workspace file path escapes the workspace");
  }
  return parts.join("/");
}

function resolveInside(root: string, path: string): string {
  const target = resolve(root, ...path.split("/"));
  const escaped = relative(root, target);
  if (escaped === ".." || escaped.startsWith(`..${sep}`)) throw new Error("workspace file path escapes the workspace");
  return target;
}

/**
 * `realRoot` must itself be a realpath: the stored root is standardized
 * (macOS drops `/private` from `/var`, `/tmp`, `/etc`), realpath is not.
 */
function escapedFrom(realRoot: string, canonical: string): boolean {
  const escaped = relative(realRoot, canonical);
  return isAbsolute(escaped) || escaped === ".." || escaped.startsWith(`..${sep}`);
}

async function assertMutableTarget(root: string, path: string): Promise<string> {
  const target = resolveInside(root, path);
  const parent = await realpath(dirname(target));
  if (escapedFrom(await realpath(root), parent)) throw new Error("workspace file path escapes the workspace");
  try {
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) throw new Error("workspace file path escapes the workspace");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

export function createWorkspaceFileService({ registry }: { readonly registry: WorkspaceRegistry }): HostWorkspaceFileService {
  const storedRoot = (workspaceId: WorkspaceId): string => {
    const workspace = registry.get(workspaceId);
    if (workspace === undefined) throw new Error("unknown workspace id");
    return workspace.canonicalPath;
  };

  async function targetFor(input: WorkspaceFileTarget, writing = false): Promise<{ target: string; path: string }> {
    const root = await realpath(storedRoot(input.workspaceId));
    let requested = input.path;
    if (/^file:/i.test(requested)) requested = fileURLToPath(requested);
    // Markdown links may use /C:/... as well as C:\... on Windows.
    if (process.platform === "win32" && /^\/[A-Za-z]:[\\/]/.test(requested)) requested = requested.slice(1);
    const candidate = isAbsolute(requested) ? requested : resolve(root, requested);
    if (writing && (await lstat(candidate)).isSymbolicLink()) throw new Error(desktopText("不能写入符号链接文件", "Cannot write through a symbolic link"));
    const target = await realpath(candidate);
    if (escapedFrom(root, target)) throw new Error(desktopText("文件不在当前工作区内", "File is outside the current workspace"));
    if (!(await lstat(target)).isFile()) throw new Error(desktopText("此路径不是文件", "Path is not a file"));
    return { target, path: relative(root, target).split(sep).join("/") };
  }
  async function inspect(input: WorkspaceFileTarget): Promise<WorkspaceFileInfo> {
    const { target, path } = await targetFor(input);
    const info = await lstat(target);
    const writable = await access(target, constants.W_OK).then(() => true, () => false);
    const identity = process.platform === "win32" ? target.toLowerCase() : target;
    return { workspaceId: input.workspaceId, path, id: createHash("sha256").update(identity).digest("hex"), name: basename(target), mime: workspaceFileMime(target), size: info.size, version: versionOf(info), writable };
  }
  const writes = new Map<string, Promise<unknown>>();
  async function writeText(input: WorkspaceFileWrite): Promise<WorkspaceFileSaveResult> {
    const { target } = await targetFor(input);
    const previous = writes.get(target) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async (): Promise<WorkspaceFileSaveResult> => {
      const file = await inspect(input);
      if (file.version !== input.expectedVersion) return { saved: false, conflict: true, file };
      if (file.size > EDITABLE_FILE_BYTES) throw new Error("文件超过内置编辑器的 8 MiB 编辑范围，请使用外部编辑器");
      const text = input.text.replace(/\r\n/g, "\n").replace(/\n/g, input.lineEnding === "crlf" ? "\r\n" : "\n");
      let bytes = Buffer.from(text, input.encoding === "utf8" ? "utf8" : "utf16le");
      if (input.encoding === "utf16be") bytes.swap16();
      if (input.bom) bytes = Buffer.concat([Buffer.from(input.encoding === "utf8" ? [239, 187, 191] : input.encoding === "utf16le" ? [255, 254] : [254, 255]), bytes]);
      if (bytes.length > EDITABLE_FILE_BYTES) throw new Error("保存内容超过 8 MiB，请使用外部编辑器");
      const temporary = resolve(dirname(target), `.juling-save-${randomUUID()}`);
      try {
        const mode = (await lstat(target)).mode;
        await writeFile(temporary, bytes, { flag: "wx", mode });
        const current = await inspect(input);
        if (current.version !== input.expectedVersion) return { saved: false, conflict: true, file: current };
        await rename(temporary, target);
        return { saved: true, file: await inspect(input) };
      } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    });
    writes.set(target, operation);
    try { return await operation; } finally { if (writes.get(target) === operation) writes.delete(target); }
  }

  async function directory(root: string, requestedPath?: string): Promise<WorkspaceFileNode[]> {
    const prefix = requestedPath === undefined ? "" : normalizeRelativePath(requestedPath);
    const target = prefix ? resolveInside(root, prefix) : root;
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error("workspace file tree path must be a real directory");
    const canonical = await realpath(target);
    if (escapedFrom(await realpath(root), canonical)) throw new Error("workspace file tree path escapes the workspace");
    const entries = await readdir(canonical, { withFileTypes: true });
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    const nodes: WorkspaceFileNode[] = [];
    for (const entry of entries) {
      if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
      if (nodes.length >= MAX_DIRECTORY_ENTRIES) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) nodes.push({ type: "dir", name: entry.name, path });
      else if (entry.isFile()) nodes.push({ type: "file", name: entry.name, path });
    }
    return nodes;
  }

  return {
    inspect,
    async writeText(input) {
      const { target } = await targetFor(input, true);
      return writeFileText(target, input, () => inspect(input));
    },
    async readText(input) {
      const { target } = await targetFor(input);
      return readFileText(target, () => inspect(input));
    },
    async readChunk(input) {
      const { target } = await targetFor(input);
      return readFileChunk(target, input);
    },
    async get(input): Promise<WorkspaceFileTreeReadModel> {
      return { workspaceId: input.workspaceId, nodes: await directory(storedRoot(input.workspaceId), input.path) };
    },
    async createFile(input): Promise<WorkspaceFileMutationResult> {
      const path = normalizeRelativePath(input.path);
      const root = storedRoot(input.workspaceId);
      const target = await assertMutableTarget(root, path);
      await writeFile(target, "", { encoding: "utf8", flag: "wx" });
      return { applied: true, kind: "file", path };
    },
    async createDirectory(input): Promise<WorkspaceFileMutationResult> {
      const path = normalizeRelativePath(input.path);
      const root = storedRoot(input.workspaceId);
      const target = await assertMutableTarget(root, path);
      await mkdir(target);
      return { applied: true, kind: "directory", path };
    },
  };
}

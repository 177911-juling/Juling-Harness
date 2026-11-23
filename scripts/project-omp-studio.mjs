#!/usr/bin/env node
/**
 * Project an upstream omp-studio tree into the Juling Harness fork identity.
 *
 * usage: node scripts/project-omp-studio.mjs <upstream-dir> <output-dir>
 *
 * Two layers:
 *   1. studio -> harness  (product/project rename, applied to text and paths)
 *   2. omp    -> juling   (only the identity tokens the fork owns; `oh-my-pi`,
 *                          `omp-patch`, legacy `OMP_*` env reads and the
 *                          `omp-*` motion keyframes are deliberately kept)
 *
 * The output is LF-normalized text plus copied binaries. It never writes into
 * the source tree.
 */
import fs from "node:fs";
import path from "node:path";

const [, , source, destination] = process.argv;
if (!source || !destination) {
  console.error("usage: node scripts/project-omp-studio.mjs <upstream-dir> <output-dir>");
  process.exit(2);
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "out", "build", ".next", "coverage"]);
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".icns", ".bmp",
  ".zip", ".gz", ".tgz", ".7z", ".rar", ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pdf", ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp3", ".mp4", ".webm", ".wav", ".ogg", ".wasm", ".node",
  ".dat", ".db", ".sqlite", ".asar", ".pak", ".appimage", ".deb", ".rpm", ".dmg",
]);

/** Product/project rename. Same rules the 0.2.0-0.2.4 projections used. */
const STUDIO_RULES = [
  [/the-snowpear\/omp-studio/g, "177911-juling/juling-harness"],
  [/@omp-studio\//g, "@juling-harness/"],
  [/OMP[ ]Studio/g, "Juling Harness"],
  [/OMP-Studio/g, "Juling-Harness"],
  [/OMP_STUDIO/g, "JULING_HARNESS"],
  [/OMPSTUDIO/g, "JULINGHARNESS"],
  [/ompstudio/g, "julingharness"],
  [/omp_studio/g, "juling_harness"],
  [/omp-studio/g, "juling-harness"],
  [/STUDIO/g, "HARNESS"],
  [/Studio/g, "Harness"],
  [/studio/g, "harness"],
];

/**
 * Fork-owned identity tokens. Every rule here has a matching local convention:
 * window bridges are `julingHarness*`, the Runtime binary is `juling(.exe)`,
 * the mobile cert/localStorage key carry the Juling name, and the installer
 * migrates with `--juling-migrate-runtime`.
 */
const IDENTITY_RULES = [
  [/ompHarness/g, "julingHarness"],
  [/omp\.exe/g, "juling.exe"],
  [/OMP_APP_USER_MODEL_ID/g, "JULING_APP_USER_MODEL_ID"],
  [/OMP_HARNESS_/g, "JULING_HARNESS_"],
  [/omp\.mobileAccess/g, "juling.mobileAccess"],
  [/--omp-migrate-runtime/g, "--juling-migrate-runtime"],
];

function renamePath(rel) {
  let value = rel.replace(/\\/g, "/");
  value = value.replace(/^packages\/studio-protocol\//, "packages/harness-protocol/");
  value = value.replace(/^packages\/studio-host\//, "packages/harness-host/");
  value = value.replace(/^packages\/client\/src\/studio-client\.ts$/, "packages/client/src/harness-client.ts");
  value = value.replace(/^omp-patch\/overlay\/packages\/coding-agent\/src\/studio\//, "omp-patch/overlay/packages/coding-agent/src/harness/");
  value = value.replace(/^(omp-patch\/patches\/\d+-)studio-/, "$1harness-");
  value = value.replace(/^packaging\/keys\/omp-studio-release-/, "packaging/keys/juling-harness-release-");
  return value.replace(/studio/g, "harness");
}

function decode(buffer, name) {
  if (BINARY_EXT.has(path.extname(name).toLowerCase())) return null;
  if (buffer.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function projectText(text) {
  let value = text;
  for (const [pattern, replacement] of STUDIO_RULES) value = value.replace(pattern, replacement);
  for (const [pattern, replacement] of IDENTITY_RULES) value = value.replace(pattern, replacement);
  return value.replace(/\r\n/g, "\n");
}

function writeProjected(rel, buffer, name) {
  const text = decode(buffer, name);
  const output = text === null ? buffer : Buffer.from(projectText(text), "utf8");
  const target = path.join(destination, renamePath(rel));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  return renamePath(rel);
}

function walk(directory, base, moved) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const rel = path.relative(base, absolute).split(path.sep).join("/");
    if (entry.isDirectory()) {
      walk(absolute, base, moved);
      continue;
    }
    if (!entry.isFile()) continue;
    const targetRel = writeProjected(rel, fs.readFileSync(absolute), entry.name);
    if (targetRel !== rel) moved.push([rel, targetRel]);
  }
}

/** The pinned Runtime entrypoint is owned by the fork, not upstream. */
function rewriteUpstreamJson() {
  const file = path.join(destination, "omp-patch", "upstream.json");
  if (!fs.existsSync(file)) return;
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  value.entrypoint = "juling.exe";
  value.entrypoints = { win32: "juling.exe", darwin: "juling", linux: "juling" };
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
const moved = [];
walk(source, source, moved);
rewriteUpstreamJson();
console.log(`projected ${source} -> ${destination}`);
console.log(`renamed paths: ${moved.length}`);
for (const [from, to] of moved.slice(0, 40)) console.log(`  ${from} -> ${to}`);

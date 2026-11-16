import { join } from "node:path";
import { RuntimeInstaller, type ActivateOptions } from "@juling-harness/runtime-installer";
import { HARNESS_PROTOCOL_VERSION } from "@juling-harness/harness-protocol";

/** Run by the freshly installed app before the legacy machine install is removed. */
export async function migrateLegacyRuntime(input: {
  legacyInstallRoot: string; userRuntimeRoot: string;
  trustedKeys: Readonly<Record<string, string | Buffer>>;
  activateOptions?: ActivateOptions;
}): Promise<void> {
  const source = new RuntimeInstaller(join(input.legacyInstallRoot, "runtime"), { trustedKeys: input.trustedKeys });
  const current = await source.currentManifest(); // Verifies signature and actual executable before copying.
  if (!current) return;
  const target = new RuntimeInstaller(input.userRuntimeRoot, { trustedKeys: input.trustedKeys });
  if (await target.currentManifest()) return; // Respect an existing verified per-user Runtime.
  await target.install(join(source.rootDirectory, "versions", current.manifest.runtimeVersion));
  // A pre-rename artifact speaks the old `omp-studio` wire protocol, so it is
  // kept as a signed rollback copy but never activated for a Harness desktop.
  const renamed = !current.manifest.patchsetVersion.startsWith("studio.");
  if (renamed && current.manifest.harnessProtocol.min <= HARNESS_PROTOCOL_VERSION && current.manifest.harnessProtocol.max >= HARNESS_PROTOCOL_VERSION) {
    await target.activate(current.manifest.runtimeVersion, input.activateOptions);
  }
  // Otherwise keep the old signed artifact for recovery; normal startup seeds
  // the compatible Runtime bundled with the new desktop.
}

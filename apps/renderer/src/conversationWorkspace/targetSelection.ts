import type { HarnessClient } from "@juling-harness/client-contract";

/** Resolve both asynchronous boundaries only while this is still the document's latest choice. */
export async function prepareTargetSelection(
  targetId: string | null,
  readyClient: (id: string | null) => Promise<HarnessClient>,
  isCurrent: () => boolean,
): Promise<{ readonly targetId: string | null; readonly workspaceId?: string } | undefined> {
  const target = await readyClient(targetId);
  if (!isCurrent()) return undefined;
  const bootstrap = await target.bootstrap();
  if (!isCurrent()) return undefined;
  return {
    targetId,
    ...(bootstrap.selected?.workspaceId ? { workspaceId: bootstrap.selected.workspaceId } : {}),
  };
}

import type { CommandInput, HarnessClient } from "@juling-harness/client-contract";
import type { WorkbenchResultMap } from "@juling-harness/harness-protocol";
import { waitReceipt } from "../hostError";

export type ServiceCommandKind = Extract<keyof WorkbenchResultMap, `services.${string}`>;

/** Keep the existing service readiness/receipt deadlines shared by both surfaces. */
export async function invokeServiceCommand<K extends ServiceCommandKind>(
  client: HarnessClient | undefined,
  kind: K,
  payload: CommandInput<K>,
): Promise<WorkbenchResultMap[K]> {
  if (!client) throw new Error("Runtime is unavailable");
  const handle = await client.command(kind, payload);
  const value = await waitReceipt<{ result: WorkbenchResultMap[K] }>(
    client,
    handle.requestId,
    kind === "services.start"
      ? ((payload as CommandInput<"services.start">).spec.ready?.timeoutMs ?? 30000) + 15000
      : 120000,
  );
  return value.result;
}

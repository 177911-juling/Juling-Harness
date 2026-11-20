import type { CommandName, ConfigWriteResult, ModelDiscoveryResult, ModelProviderProbeInput, ModelProviderTestResult, HarnessClient } from "@juling-harness/client-contract";
import { waitReceipt } from "../../hostError";

export async function runWrite<T extends Extract<CommandName, `models.${string}`>>(
  client: HarnessClient,
  name: T,
  input: Parameters<HarnessClient["command"]>[1] extends never ? never : unknown,
): Promise<ConfigWriteResult> {
  const handle = await client.command(name, input as never);
  return waitReceipt<ConfigWriteResult>(client, handle.requestId);
}

export async function runTest(
  client: HarnessClient,
  input: { readonly providerId?: string; readonly api?: string; readonly endpointUrl?: string; readonly apiKey?: string },
): Promise<ModelProviderTestResult> {
  const handle = await client.command("models.provider.test", input as never);
  return waitReceipt<ModelProviderTestResult>(client, handle.requestId);
}

export async function runProbe(
  client: HarnessClient,
  input: ModelProviderProbeInput,
): Promise<ModelDiscoveryResult> {
  const handle = await client.command("models.provider.probe", input as never);
  return waitReceipt<ModelDiscoveryResult>(client, handle.requestId);
}

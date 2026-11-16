import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HarnessClient } from "@juling-harness/client-contract";
import { ExtensionLinksProvider } from "./ExtensionLinks";
import { MarkdownInline } from "./markdown";

afterEach(cleanup);

it("routes a registered custom URL to its conversation's extension and keeps unsupported schemes inert", async () => {
  const query = vi.fn(async () => ({ schemes: ["harness-test"] }));
  const command = vi.fn(async () => { throw new Error("extension target closed"); });
  const client = { query } as unknown as Pick<HarnessClient, "query">;
  const actions = { command, subscribe: vi.fn() } as unknown as Pick<HarnessClient, "command" | "subscribe">;
  const { container } = render(<ExtensionLinksProvider client={client} actions={actions} sessionId="main" sourceSessionId="child-session" agentId="worker"><MarkdownInline text="[Open](harness-test:details/1) [Unknown](unknown:run) [Unsafe](javascript:alert)" /></ExtensionLinksProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Open" }));
  await screen.findByText("extension target closed");
  expect(command).toHaveBeenCalledWith("extensions.links.activate", { sessionId: "main", sourceSessionId: "child-session", agentId: "worker", url: "harness-test:details/1" });
  expect(container.querySelector("a")).toBeNull();
  expect(screen.queryByRole("button", { name: "Unknown" })).toBeNull();
});

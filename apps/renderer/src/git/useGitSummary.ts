import { useEffect, useState } from "react";
import type { QueryResult, HarnessClient, WorkspaceId } from "@juling-harness/client-contract";
import { hostErrorMessage } from "../hostError";

/** The breadcrumb never needs file revisions, diffs or untracked line counts. */
export function useGitSummary(client: HarnessClient, workspaceId?: WorkspaceId) {
  const [value, setValue] = useState<{ client: HarnessClient; workspaceId: WorkspaceId; repository?: QueryResult<"git.repository.summary">; error?: string }>();
  useEffect(() => {
    if (!workspaceId) return;
    let active = true, generation = 0;
    const read = () => {
      const token = ++generation;
      void client.query("git.repository.summary", { workspaceId }).then(repository => {
        if (active && token === generation) setValue({ client, workspaceId, repository });
      }).catch(cause => { if (active && token === generation) setValue({ client, workspaceId, error: hostErrorMessage(cause, "无法读取 Git 摘要") }); });
    };
    read();
    const off = client.subscribe({ scope: "all" }, event => {
      if (event.kind === "git.repository.changed" && event.repository.workspaceId === workspaceId) read();
    });
    return () => { active = false; off(); };
  }, [client, workspaceId]);
  const current = value?.client === client && value.workspaceId === workspaceId ? value : undefined;
  return { repository: current?.repository, error: current?.error };
}

export type GitView = "changes" | "history" | "issue" | "pr";
export type GitHistoryLayout = "list" | "graph";

/** Git remains usable when privacy settings disable localStorage; unknown values use the default view. */
export function readGitView(key: string): GitView {
  try {
    const saved = globalThis.localStorage?.getItem(key);
    return saved === "history" || saved === "issue" || saved === "pr" ? saved : "changes";
  } catch {
    return "changes";
  }
}

export function readGitHistoryLayout(key: string): GitHistoryLayout {
  try { return globalThis.localStorage?.getItem(key) === "graph" ? "graph" : "list"; }
  catch { return "list"; }
}

export function writeGitPreference(key: string, value: GitView | GitHistoryLayout): void {
  try { globalThis.localStorage?.setItem(key, value); }
  catch { /* The React state still owns the selection for this session. */ }
}

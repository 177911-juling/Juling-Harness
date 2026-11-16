import { useEffect, useId, useState, type ReactNode } from "react";
import type { GitDiffTarget, GitHubReference, HarnessClient, WorkspaceId } from "@juling-harness/client-contract";
import { useI18n } from "../i18n";
import { usePreviewMode } from "../preview/PreviewContext";
import { PreviewGitPanel } from "../preview/surfaces";
import { GitStatusPanel } from "./GitStatusPanel";
import { GitHubPanel } from "./GitHubPanel";
import { WorkspaceTabs } from "../workspaces/Workspace";
import { useWideLayout } from "../layout/useWideLayout";
import { readGitView, writeGitPreference, type GitView } from "./viewMemory";
import "./github.css";

/** From this width the view switcher joins the title row and changes sit beside their diff. */
const GIT_WIDE_MIN = 880;

export type GitOpenIntent = { key: number; view: GitView; path?: string; target?: GitDiffTarget; remote?: string; number?: number; search?: string };
export function GitWorkbench(props: { client: HarnessClient; workspaceId?: WorkspaceId; workspaceName?: string; visible: boolean; worktrees: ReactNode; intent?: GitOpenIntent | undefined; onReference: (reference: GitHubReference) => void }) {
  const { preview } = usePreviewMode();
  return <GitWorkbenchBody key={`${preview ? "preview" : "real"}:${props.workspaceId ?? "none"}`} {...props} />;
}
function GitWorkbenchBody({ client, workspaceId, workspaceName, visible, worktrees, intent, onReference }: Parameters<typeof GitWorkbench>[0]) {
  const { preview } = usePreviewMode();
  const { t } = useI18n();
  const tabsId = useId();
  const [rootRef, wide] = useWideLayout<HTMLDivElement>(GIT_WIDE_MIN);
  const storage = `omp.git.view:${preview ? "preview" : workspaceId ?? "none"}`;
  const [view, setView] = useState<GitView>(() => readGitView(storage));
  const local = view === "changes" || view === "history";
  const [localMounted, setLocalMounted] = useState(local);
  const [activeIntent, setActiveIntent] = useState(intent);
  const chooseView = (next: GitView) => {
    if (next === "changes" || next === "history") setLocalMounted(true);
    setActiveIntent(undefined);
    setView(next); writeGitPreference(storage, next);
  };
  useEffect(() => {
    if (!intent) return;
    setActiveIntent(intent);
    if (intent.view === "changes" || intent.view === "history") setLocalMounted(true);
    setView(intent.view);
    writeGitPreference(storage, intent.view);
  }, [intent, storage]);
  const tabs = <WorkspaceTabs<GitView> id={tabsId} label={t("github.views")} value={view} onChange={chooseView} items={[
    { id: "changes", icon: "changes", label: t("github.changes") },
    { id: "history", icon: "history", label: t("github.history") },
    { id: "issue", icon: "alert-c", label: "Issues" },
    { id: "pr", icon: "branch", label: "PR" },
  ]} />;
  return <div className={`git-workbench${wide ? " is-wide" : ""}`} ref={rootRef}>
    <div className="git-workbench-heading"><span className="ellipsis">{workspaceName ?? "Git"}</span>{wide ? tabs : null}{worktrees}</div>
    {wide ? null : <div className="git-view-tabs">{tabs}</div>}
    <div className="git-view-body" role="tabpanel" id={`${tabsId}-${view}-panel`} aria-labelledby={`${tabsId}-${view}`}>
      {localMounted ? <div className="git-local-view" hidden={!local}>{preview ? <PreviewGitPanel view={view === "history" ? "history" : "changes"} {...(activeIntent?.view === "changes" && activeIntent.path ? { focusPath: activeIntent.path, focusKey: activeIntent.key } : {})} /> : <GitStatusPanel client={client} {...(workspaceId ? { workspaceId } : {})} {...(activeIntent?.view === "changes" && activeIntent.path ? { focusPath: activeIntent.path, focusKey: activeIntent.key, ...(activeIntent.target ? { focusTarget: activeIntent.target } : {}) } : {})} view={view === "history" ? "history" : "changes"} />}</div> : null}
      {!local ? <GitHubPanel client={client} {...(workspaceId ? { workspaceId } : {})} kind={view} visible={visible} {...(activeIntent?.view === view ? { intent: activeIntent } : {})} onReference={onReference} /> : null}
    </div>
  </div>;
}

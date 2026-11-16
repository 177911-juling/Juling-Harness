import type { WorkspaceFileInfo } from "@juling-harness/client-contract";

export interface FileResourceTarget { targetId: string | null; workspaceId: string; path: string }
export interface FileResource { id: string; url: string; file: WorkspaceFileInfo }
export interface OfficeComponentState {
  id: "office-preview";
  status: "not-installed" | "ready" | "checking" | "downloading" | "installing" | "error";
  installedVersion?: string;
  availableVersion?: string;
  downloadBytes?: number;
  receivedBytes?: number;
  message?: string;
}
export interface FileViewerDesktopApi {
  open(input: FileResourceTarget): Promise<FileResource>;
  release(id: string): Promise<void>;
  export(input: FileResourceTarget): Promise<boolean>;
  officeState(check?: boolean): Promise<OfficeComponentState>;
  officeInstall(): Promise<OfficeComponentState>;
  officeCancel(): Promise<void>;
  officeUninstall(): Promise<OfficeComponentState>;
  officePreview(id: string): Promise<{ url: string }>;
  onOfficeState(listener: (state: OfficeComponentState) => void): () => void;
  setDirty(count: number): Promise<void>;
  onCloseRequested(listener: (id: string) => void): () => void;
  finishClose(id: string, allow: boolean): Promise<void>;
}
export const FILE_VIEWER_CHANNELS = {
  open: "juling-harness:files-open", release: "juling-harness:files-release", export: "juling-harness:files-export",
  officeState: "juling-harness:office-state", officeInstall: "juling-harness:office-install", officeCancel: "juling-harness:office-cancel",
  officeUninstall: "juling-harness:office-uninstall", officePreview: "juling-harness:office-preview", officeChanged: "juling-harness:office-changed",
  dirty: "juling-harness:files-dirty", closeRequested: "juling-harness:files-close-requested", finishClose: "juling-harness:files-finish-close",
} as const;

import type { ArtifactKind, ArtifactRecord, ArtifactStorageState } from "@juling-harness/harness-protocol";

export const CHROME_ARTIFACT_CHANNELS = {
  chooseDirectory: "juling-harness:desktop:artifacts-directory",
  import: "juling-harness:desktop:artifacts-import",
  export: "juling-harness:desktop:artifacts-export",
} as const;
export type ArtifactFileResult = { ok: true; cancelled: boolean; artifact?: ArtifactRecord; storage?: ArtifactStorageState } | { ok: false; message: string };
export interface ArtifactImportInput { kind: ArtifactKind; sessionId?: string; workspaceId?: string }
export interface ArtifactDesktopApi {
  chooseArtifactDirectory(): Promise<ArtifactFileResult>;
  importArtifact(input: ArtifactImportInput): Promise<ArtifactFileResult>;
  exportArtifact(input: { artifactId: string }): Promise<ArtifactFileResult>;
}

import type { ArtifactRecord } from "@juling-harness/harness-protocol";
export const MEDIA_UPLOAD_CHANNELS = { begin: "juling-harness:desktop:media-upload-begin", chunk: "juling-harness:desktop:media-upload-chunk", finish: "juling-harness:desktop:media-upload-finish", abort: "juling-harness:desktop:media-upload-abort" } as const;
export interface MediaUploadInput { kind: "image" | "video" | "audio"; name: string; mimeType: string; workspaceId?: string; sessionId?: string }
export type MediaUploadResult = { ok: true; uploadId?: string; artifact?: ArtifactRecord } | { ok: false; message: string };

export const LIVE_AUDIO_CHANNELS = {
  attach: "juling-harness:desktop:live-audio-attach",
  chunk: "juling-harness:desktop:live-audio-chunk",
  detach: "juling-harness:desktop:live-audio-detach",
} as const;
export interface LiveAudioResult { ok: boolean; message?: string }
export interface LiveAudioAttach { audioId: string; sessionId: string }
export interface LiveAudioChunk { audioId: string; sequence: number; bytes: ArrayBuffer }

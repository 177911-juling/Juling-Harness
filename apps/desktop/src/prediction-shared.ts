import type {
  PredictionChannel,
  PredictionEvent,
  PredictionInput,
} from "@juling-harness/harness-protocol";
export const PREDICTION_CHANNELS = {
  attach: "juling-harness:desktop:prediction-attach",
  input: "juling-harness:desktop:prediction-input",
  detach: "juling-harness:desktop:prediction-detach",
  import: "juling-harness:desktop:prediction-import",
  event: "juling-harness:desktop:prediction-event",
} as const;
export interface PredictionResult {
  ok: boolean;
  cancelled?: boolean;
  message?: string;
  count?: number;
  truncated?: boolean;
}
export type PredictionAttach = PredictionChannel;
export type PredictionControl = {
  channelId: string;
  input: Exclude<PredictionInput, { kind: "import" }>;
};
export type { PredictionEvent };

/**
 * Caption-button overlay constants shared by Main and the sandboxed preload.
 * No Electron Main APIs — preload may import this file.
 *
 * The renderer may accompany the theme with an optional caption tint derived
 * from the active background's average colour. Main validates both colours
 * and falls back to the stock theme palette when anything is off.
 */
export const TITLEBAR_OVERLAY_CHANNEL = "juling-harness:desktop:chrome-theme";
export const TITLEBAR_OVERLAY_HEIGHT = 36;

/** Caption buttons paint the DEFAULT CANVAS colour so the strip reads as part
 *  of the window background（浅色 #dde4f3 = --bg 瓷白雾蓝，暗色 #05070f = --bg
 *  深空黑曜；符号用主题正文字色）。与 WINDOW_BACKGROUND 保持一致是硬要求。 */
export const TITLEBAR_OVERLAY = {
  light: { color: "#dde4f3", symbolColor: "#37405e" },
  dark: { color: "#05070f", symbolColor: "#b6bed6" },
} as const;

/** Window base paint (first-paint / resize flashes) follows the canvas, NOT the
 *  caption accent — the aurora canvas colours live in renderer tokens. */
export const WINDOW_BACKGROUND = {
  light: "#dde4f3",
  dark: "#05070f",
} as const;

export type TitlebarTheme = keyof typeof TITLEBAR_OVERLAY;

export interface TitlebarTint {
  readonly color: string;
  readonly symbolColor: string;
}

export interface TitlebarThemePayload {
  readonly theme: TitlebarTheme;
  readonly tint?: TitlebarTint;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

function parseTint(value: unknown): TitlebarTint | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const record = value as { color?: unknown; symbolColor?: unknown };
  if (!isHexColor(record.color) || !isHexColor(record.symbolColor)) return undefined;
  return { color: record.color, symbolColor: record.symbolColor };
}

/** Parses the renderer payload; an invalid tint is dropped, an invalid theme rejects. */
export function parseTitlebarThemePayload(value: unknown): TitlebarThemePayload | undefined {
  if (value === null || typeof value !== "object" || !("theme" in value)) return undefined;
  const theme = (value as { theme?: unknown }).theme;
  if (theme !== "light" && theme !== "dark") return undefined;
  const tint = parseTint((value as { tint?: unknown }).tint);
  return tint === undefined ? { theme } : { theme, tint };
}

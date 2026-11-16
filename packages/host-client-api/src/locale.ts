/**
 * Dynamic locale helper for @juling-harness/host-client-api.
 * Evaluates JULING_HARNESS_LOCALE per call so Desktop Main updates take effect
 * immediately without restarting in-process adapters; defaults to English.
 */
export function isHostLocaleZh(): boolean {
  return (process.env.JULING_HARNESS_LOCALE ?? "").toLowerCase().startsWith("zh");
}

export function hostText(zh: string, en: string): string {
  return isHostLocaleZh() ? zh : en;
}

/**
 * Dynamic locale helper for Harness's Coding Agent runtime overlay.
 * Evaluates JULING_HARNESS_LOCALE per call and defaults to English when unset.
 */
export function isRuntimeLocaleZh(): boolean {
	return (process.env.JULING_HARNESS_LOCALE ?? "").toLowerCase().startsWith("zh");
}

export function runtimeText(zh: string, en: string): string {
	return isRuntimeLocaleZh() ? zh : en;
}

export function setRuntimeLocale(locale: "zh" | "en"): void {
	process.env.JULING_HARNESS_LOCALE = locale;
}

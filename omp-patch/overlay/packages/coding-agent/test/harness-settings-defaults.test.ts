import { expect, test } from "bun:test";
import { Settings } from "../src/config/settings";
import { cfgProvidersCacheWarming } from "../src/session/settings";
import { applyHarnessDefaults } from "../src/harness/settings-defaults";

test("Harness startup preserves native warming policy and later explicit choices", () => {
	const cli = Settings.isolated();
	const harness = Settings.isolated();
	const nativePolicy = cfgProvidersCacheWarming.get(cli);
	applyHarnessDefaults(harness);
	expect(cfgProvidersCacheWarming.get(harness)).toBe(nativePolicy);
	cfgProvidersCacheWarming.set(harness, "streaming");
	applyHarnessDefaults(harness);
	expect(cfgProvidersCacheWarming.get(harness)).toBe("streaming");
});

test("explicit warming config survives Harness startup and repeated session initialization", () => {
	const settings = Settings.isolated({ "providers.cacheWarming": "idle" });
	applyHarnessDefaults(settings);
	applyHarnessDefaults(settings);
	expect(cfgProvidersCacheWarming.get(settings)).toBe("idle");
});

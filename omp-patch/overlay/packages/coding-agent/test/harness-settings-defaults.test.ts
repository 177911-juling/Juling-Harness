import { expect, test } from "bun:test";
import { Settings } from "../src/config/settings";
import { cfgProvidersCacheWarming } from "../src/session/settings";
import { applyHarnessDefaults } from "../src/harness/settings-defaults";

test("Harness disables unconfigured warming without changing CLI or blocking later explicit choices", () => {
	const cli = Settings.isolated();
	const harness = Settings.isolated();
	applyHarnessDefaults(harness);
	expect(cfgProvidersCacheWarming.get(harness)).toBe("off");
	expect(cfgProvidersCacheWarming.get(cli)).toBe("idle");
	cfgProvidersCacheWarming.set(harness, "streaming");
	expect(cfgProvidersCacheWarming.get(harness)).toBe("streaming");
	applyHarnessDefaults(harness);
	expect(cfgProvidersCacheWarming.get(harness)).toBe("streaming");
});

test("explicit warming config survives Harness startup and repeated session initialization", () => {
	const settings = Settings.isolated({ "providers.cacheWarming": "idle" });
	applyHarnessDefaults(settings);
	applyHarnessDefaults(settings);
	expect(cfgProvidersCacheWarming.get(settings)).toBe("idle");
});

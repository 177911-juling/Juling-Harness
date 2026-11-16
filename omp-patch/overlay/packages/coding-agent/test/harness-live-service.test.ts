import { describe, expect, test } from "bun:test";
import {
	HarnessLiveError,
	HarnessLiveService,
	type HarnessLiveSessionFactory,
} from "@oh-my-pi/pi-coding-agent/harness/services/live-service";

describe("Harness Live service", () => {
	test("fails closed without a frontend media sideband and keeps state off", async () => {
		const service = new HarnessLiveService();
		expect(() => service.start()).toThrow(HarnessLiveError);
		expect(service.state()).toEqual({ status: "off" });
		expect(await service.stop()).toEqual({ stopped: false });
	});

	test("publishes connecting, active, stopping, and off through an injected session", async () => {
		const states: string[] = [];
		let stopCalls = 0;
		const factory: HarnessLiveSessionFactory = {
			create: () => ({
				start: async () => {},
				stop: async () => {
					stopCalls += 1;
				},
			}),
		};
		const service = new HarnessLiveService(factory);
		service.onChange(state => states.push(state.status));
		expect(await service.start("microphone-1")).toEqual({ status: "active", deviceId: "microphone-1" });
		expect(await service.stop()).toEqual({ stopped: true });
		expect(await service.stop()).toEqual({ stopped: false });
		expect(stopCalls).toBe(1);
		expect(states).toEqual(["connecting", "active", "stopping", "off"]);
	});

	test("failed startup is observable and a stop resets it to off", async () => {
		const service = new HarnessLiveService({
			create: () => ({
				start: async () => {
					throw new Error("media failed");
				},
				stop: async () => {},
			}),
		});
		await expect(service.start()).rejects.toThrow("media failed");
		expect(service.state().status).toBe("failed");
		expect(await service.stop()).toEqual({ stopped: false });
		expect(service.state().status).toBe("off");
	});
});

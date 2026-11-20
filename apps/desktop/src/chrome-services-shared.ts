import type { ServiceDefinition, ServiceDefinitionsInput } from "./service-definitions.js";
export const CHROME_SERVICE_CHANNELS = {
  list: "juling-harness:desktop:service-definitions-list",
  save: "juling-harness:desktop:service-definitions-save",
  remove: "juling-harness:desktop:service-definitions-remove",
} as const;
export type ServiceDefinitionResult = { ok: true; definitions: ServiceDefinition[] } | { ok: false; message: string };
export type { ServiceDefinition, ServiceDefinitionsInput };

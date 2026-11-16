/**
 * Ambient types for the native HTML-form helpers the renderer shares with the
 * Runtime. Vite resolves these specifiers to the pinned vendor sources at
 * build time; declaring them here keeps those sources out of the renderer
 * TypeScript program (they are compiled by the Runtime with its own settings).
 */
declare module "@oh-my-pi/pi-tui/html-form/model" {
	import type { FormSpan } from "@juling-harness/harness-protocol";
	export function spansText(spans: readonly FormSpan[]): string;
}

declare module "@oh-my-pi/pi-tui/html-form/data" {
	import type {
		FormAnswerValue,
		FormChoiceField,
		FormTextField,
		InteractionFormField,
	} from "@juling-harness/harness-protocol";
	export const OTHER_LABEL: string;
	export function isArrayChoice(field: FormChoiceField): boolean;
	export function choiceValue(
		field: FormChoiceField,
		checked: ReadonlySet<number>,
		other?: string,
	): FormAnswerValue | undefined;
	export function textValue(field: FormTextField, text: string): FormAnswerValue;
	export function fieldError(
		field: InteractionFormField,
		value: FormAnswerValue | undefined,
	): string | undefined;
}

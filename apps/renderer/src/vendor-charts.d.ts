/**
 * Ambient types for the upstream chart planner the renderer shares with the
 * Runtime. Vite resolves these specifiers to the pinned vendor sources; the
 * renderer only forwards opaque table data, so the planner's internal shapes
 * stay out of this TypeScript program.
 */
declare module "@oh-my-pi/pi-tui/charts/table-data" {
	export function analyzeTable(
		header: readonly string[],
		rows: readonly (readonly string[])[],
	): unknown;
}

declare module "@oh-my-pi/pi-tui/charts/chart-plan" {
	export function planChart(analysis: unknown): unknown | undefined;
	export function buildChart(analysis: unknown, plan: unknown): unknown | undefined;
	export function worthCharting(spec: unknown): boolean;
}

declare module "@oh-my-pi/pi-tui/charts/chart-svg" {
	export function renderChartSvg(spec: unknown): string;
}

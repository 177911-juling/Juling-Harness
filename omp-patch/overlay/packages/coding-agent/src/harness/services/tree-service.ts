import { expandModelMentionTags, type ModelMention } from "@oh-my-pi/pi-tui/prompt/model-mention-syntax";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { AgentSession } from "../../session/agent-session";
import type { SessionTreeNode } from "../../session/session-entries";
import { reanswerAskForm } from "../../tools/ask";
import { HarnessRemoteExtensionUiContext, type HarnessUiGateway } from "../remote-extension-ui";
import type { AskToolDetails } from "@oh-my-pi/pi-tui/tools/ask";
import type { HarnessInteractionPort } from "./interaction-port";

const EDITOR_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export type HarnessEditorImage = {
	type: "image";
	mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
	data: string;
};

function editorImagesFrom(
	images: ReadonlyArray<{ type?: string; mimeType?: string; data?: string }> | undefined,
): HarnessEditorImage[] {
	if (images === undefined || images.length === 0) return [];
	const out: HarnessEditorImage[] = [];
	for (const image of images) {
		if (image.type !== "image") continue;
		if (typeof image.data !== "string" || image.data.length === 0) continue;
		if (!EDITOR_IMAGE_MIME.has(image.mimeType ?? "")) continue;
		out.push({
			type: "image",
			mimeType: image.mimeType as HarnessEditorImage["mimeType"],
			data: image.data,
		});
	}
	return out;
}

export interface HarnessTreeNode {
	id: string;
	parentId: string | null;
	type: string;
	timestamp: string;
	label?: string;
	role?: string;
	toolName?: string;
	children: HarnessTreeNode[];
}

export class HarnessTreeError extends Error {
	constructor(
		readonly code: "INTERACTION_REQUIRED" | "INVALID_ARGUMENT" | "BUSY_STREAMING" | "BUSY_COMPACTING",
		message: string,
		readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "HarnessTreeError";
	}
}

function projectNode(node: SessionTreeNode): HarnessTreeNode {
	const entry = node.entry;
	const message = entry.type === "message" ? entry.message : undefined;
	return {
		id: entry.id,
		parentId: entry.parentId,
		type: entry.type,
		timestamp: entry.timestamp,
		...(node.label === undefined ? {} : { label: node.label }),
		...(message === undefined ? {} : { role: message.role }),
		...(message?.role === "toolResult" ? { toolName: message.toolName } : {}),
		children: node.children.map(projectNode),
	};
}

export class HarnessTreeService {
	constructor(
		private readonly session: AgentSession,
		private readonly interaction?: HarnessInteractionPort,
	) {}

	#restoreModelTags(text: string, previous: readonly ModelMention[]): string {
		const selectors = new Map(
			[...previous, ...(this.session.modelMentions ?? [])].map(mention => [mention.agent, mention.selector]),
		);
		return expandModelMentionTags(text, agent => selectors.get(agent));
	}

	getTree(): { leafId: string | null; roots: HarnessTreeNode[]; supportsExactRestore: true } {
		return {
			supportsExactRestore: true,
			leafId: this.session.sessionManager.getLeafId(),
			roots: this.session.sessionManager.getTree().map(projectNode),
		};
	}

	async navigate(
		commandId: string,
		input: {
			targetId: string;
			summarize?: boolean;
			customInstructions?: string;
			exactLeaf?: boolean;
			restoreRoot?: boolean;
		},
	): Promise<unknown> {
		if (this.session.isStreaming) throw new HarnessTreeError("BUSY_STREAMING", "Runtime is streaming");
		if (this.session.isCompacting) throw new HarnessTreeError("BUSY_COMPACTING", "Runtime is compacting");
		const mentions = [...(this.session.modelMentions ?? [])];
		const targetId = input.restoreRoot ? this.session.sessionManager.getLeafId() : input.targetId;
		if (targetId === null) return { cancelled: false, leafId: null };
		let result = await this.session.navigateTree(targetId, {
			summarize: input.summarize,
			customInstructions: input.customInstructions,
			allowAskReopen: !input.exactLeaf && !input.restoreRoot,
			exactLeaf: input.exactLeaf,
			restoreRoot: input.restoreRoot,
			requireIdle: input.exactLeaf || input.restoreRoot,
		});
		if (result.reopenAsk !== undefined) {
			if (this.interaction === undefined) {
				throw new HarnessTreeError("INTERACTION_REQUIRED", "Tree navigation requires an Ask response", {
					toolCallId: result.reopenAsk.toolCallId,
					html: result.reopenAsk.html,
				});
			}
			const reanswer = await this.#reanswerAsk(commandId, result.reopenAsk.html);
			if (reanswer === undefined) {
				return {
					cancelled: true,
					aborted: false,
					askReanswerCommitted: false,
					leafId: this.session.sessionManager.getLeafId(),
				};
			}
			result = await this.session.navigateTree(input.targetId, {
				summarize: input.summarize,
				customInstructions: input.customInstructions,
				allowAskReopen: true,
				reanswerAskResult: reanswer,
			});
		}
		if (result.askReanswerCommitted) this.session.resumeAfterAskReanswer();
		if (!result.cancelled && (input.exactLeaf || input.restoreRoot)) {
			// A metadata child makes the chosen branch survive a restart without truncating history.
			this.session.sessionManager.appendCustomEntry("harness-time-travel", {
				targetId: this.session.sessionManager.getLeafId(),
			});
			await this.session.sessionManager.flush();
		}
		const editorImages = editorImagesFrom(result.editorImages);
		return {
			cancelled: result.cancelled,
			aborted: result.aborted === true,
			askReanswerCommitted: result.askReanswerCommitted === true,
			leafId: this.session.sessionManager.getLeafId(),
			...(result.editorText === undefined
				? {}
				: { editorText: this.#restoreModelTags(result.editorText, mentions) }),
			...(editorImages.length === 0 ? {} : { editorImages }),
		};
	}

	async branch(_commandId: string, input: { targetId: string }): Promise<unknown> {
		if (this.session.isStreaming) throw new HarnessTreeError("BUSY_STREAMING", "Runtime is streaming");
		if (this.session.isCompacting) throw new HarnessTreeError("BUSY_COMPACTING", "Runtime is compacting");
		const mentions = [...(this.session.modelMentions ?? [])];
		const result = await this.session.branch(input.targetId);
		const editorImages = editorImagesFrom(result.selectedImages);
		return {
			cancelled: result.cancelled,
			sessionId: this.session.sessionManager.getSessionId(),
			editorText: this.#restoreModelTags(result.selectedText, mentions),
			...(editorImages.length === 0 ? {} : { editorImages }),
		};
	}

	async #reanswerAsk(commandId: string, html: string): Promise<AgentToolResult<AskToolDetails> | undefined> {
		const ui = new HarnessRemoteExtensionUiContext(this.interaction! as HarnessUiGateway, commandId);
		return reanswerAskForm(ui, html);
	}
}

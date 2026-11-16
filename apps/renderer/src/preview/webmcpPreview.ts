import type { HarnessWebMcpCatalog, WebMcpInvokeResult } from "@juling-harness/harness-protocol";

export const PREVIEW_WEBMCP: HarnessWebMcpCatalog = {
  pageId: "preview-page", documentId: "preview-document", status: "ready", truncated: false, untrusted: true, invocationAvailable: true,
  tools: [{ name: "search_docs", description: "搜索 Harness 使用说明", frameId: "main", origin: "http://localhost:4173", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, untrusted: true }],
};
export const PREVIEW_WEBMCP_RESULT: WebMcpInvokeResult = { ok: true, untrusted: true, result: { title: "浏览器 · 使用说明", section: "网页工具与控制权", matches: 3 } };

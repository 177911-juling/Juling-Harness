import type { HarnessWebMcpCatalog, WebMcpInvokeResult } from "@juling-harness/harness-protocol";
import { isZh } from "../i18n";

export function getPreviewWebMcp(zh = isZh()): HarnessWebMcpCatalog {
  return {
    pageId: "preview-page", documentId: "preview-document", status: "ready", truncated: false, untrusted: true, invocationAvailable: true,
    tools: [{ name: "search_docs", description: zh ? "搜索 Harness 使用说明" : "Search Harness documentation", frameId: "main", origin: "http://localhost:4173", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, untrusted: true }],
  };
}

export function getPreviewWebMcpResult(zh = isZh()): WebMcpInvokeResult {
  return { ok: true, untrusted: true, result: { title: zh ? "浏览器 · 使用说明" : "Browser · User guide", section: zh ? "网页工具与控制权" : "Web tools and control", matches: 3 } };
}

export const PREVIEW_WEBMCP: HarnessWebMcpCatalog = getPreviewWebMcp();
export const PREVIEW_WEBMCP_RESULT: WebMcpInvokeResult = getPreviewWebMcpResult();

/**
 * Preview-mode statistics surface.
 *
 * The real page embeds the native `juling stats` dashboard, which the Host only
 * serves when a Runtime is running. Preview must not fabricate that endpoint, so
 * this module draws the same sections from local fixtures instead: KPIs, the
 * activity chart, token mix, per-source split, and one table per tab.
 *
 * Numbers are fixed so screenshots and reviews stay stable; nothing here is
 * random. Labels take the interface language like every other fixture.
 */

export type StatsRange = "1h" | "24h" | "2d" | "3d" | "7d" | "30d" | "90d" | "all";

export type StatsTab =
  | "overview" | "models" | "providers" | "costs"
  | "requests" | "errors" | "traces"
  | "tools" | "frustration" | "projects" | "gain" | "spotlight";

export const STATS_RANGES: readonly { readonly id: StatsRange; readonly label: string }[] = [
  { id: "1h", label: "1h" },
  { id: "24h", label: "24h" },
  { id: "2d", label: "2d" },
  { id: "3d", label: "3d" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

export const STATS_NAV: readonly {
  readonly group: readonly [string, string];
  readonly items: readonly { readonly id: StatsTab; readonly label: readonly [string, string]; readonly key: string }[];
}[] = [
  {
    group: ["使用", "Usage"],
    items: [
      { id: "overview", label: ["概览", "Overview"], key: "O" },
      { id: "models", label: ["模型", "Models"], key: "M" },
      { id: "providers", label: ["供应商", "Providers"], key: "P" },
      { id: "costs", label: ["费用", "Costs"], key: "C" },
    ],
  },
  {
    group: ["活动", "Activity"],
    items: [
      { id: "requests", label: ["请求", "Requests"], key: "R" },
      { id: "errors", label: ["错误", "Errors"], key: "E" },
      { id: "traces", label: ["追踪", "Traces"], key: "T" },
    ],
  },
  {
    group: ["洞察", "Insights"],
    items: [
      { id: "tools", label: ["工具", "Tools"], key: "L" },
      { id: "frustration", label: ["挫败信号", "Frustration"], key: "F" },
      { id: "projects", label: ["项目", "Projects"], key: "J" },
      { id: "gain", label: ["收益", "Gain"], key: "G" },
      { id: "spotlight", label: ["聚光", "Spotlight"], key: "S" },
    ],
  },
];

export type StatsKpi = { readonly label: readonly [string, string]; readonly value: string; readonly note: readonly [string, string] };

export type StatsActivityPoint = { readonly label: string; readonly requests: number; readonly tokens: number; readonly cost: number };

export type StatsSource = { readonly label: readonly [string, string]; readonly requests: number; readonly tokens: string; readonly share: number };

export type StatsRequestRow = {
  readonly model: string;
  readonly provider: string;
  readonly when: string;
  readonly tokens: string;
  readonly cost: string;
  readonly duration: string;
  readonly status: "ok" | "failed";
};

export type StatsTable = {
  readonly title: readonly [string, string];
  readonly subtitle: readonly [string, string];
  readonly columns: readonly (readonly [string, string])[];
  readonly rows: readonly (readonly string[])[];
};

export type StatsPreviewData = {
  readonly kpis: readonly StatsKpi[];
  readonly secondary: readonly StatsKpi[];
  readonly activity: readonly StatsActivityPoint[];
  readonly tokenMix: readonly { readonly label: readonly [string, string]; readonly share: number }[];
  readonly sources: readonly StatsSource[];
  readonly latest: readonly StatsRequestRow[];
  readonly tables: Partial<Record<StatsTab, StatsTable>>;
};

/** Daily buckets covering roughly one year, so the range switcher has shape. */
const ACTIVITY: readonly StatsActivityPoint[] = [
  { label: "11-15", requests: 120, tokens: 18_400_000, cost: 0.42 },
  { label: "11-20", requests: 210, tokens: 32_100_000, cost: 0.88 },
  { label: "11-25", requests: 180, tokens: 27_600_000, cost: 0.71 },
  { label: "11-30", requests: 260, tokens: 41_200_000, cost: 1.06 },
  { label: "12-05", requests: 340, tokens: 58_900_000, cost: 1.44 },
  { label: "12-10", requests: 410, tokens: 74_300_000, cost: 1.82 },
  { label: "12-15", requests: 520, tokens: 96_500_000, cost: 2.31 },
  { label: "12-20", requests: 610, tokens: 118_400_000, cost: 2.74 },
  { label: "12-25", requests: 480, tokens: 88_200_000, cost: 2.05 },
  { label: "12-30", requests: 700, tokens: 143_800_000, cost: 3.36 },
  { label: "01-04", requests: 860, tokens: 178_500_000, cost: 4.11 },
  { label: "01-09", requests: 1_020, tokens: 214_900_000, cost: 4.92 },
  { label: "01-14", requests: 940, tokens: 196_700_000, cost: 4.53 },
  { label: "01-19", requests: 1_180, tokens: 251_300_000, cost: 5.74 },
  { label: "01-24", requests: 1_320, tokens: 288_600_000, cost: 6.42 },
  { label: "01-29", requests: 1_090, tokens: 231_400_000, cost: 5.28 },
  { label: "02-03", requests: 1_240, tokens: 267_100_000, cost: 6.08 },
  { label: "02-08", requests: 1_460, tokens: 318_900_000, cost: 7.15 },
  { label: "02-13", requests: 1_380, tokens: 302_500_000, cost: 6.82 },
  { label: "02-18", requests: 1_590, tokens: 351_200_000, cost: 7.88 },
];

export function statsPreviewData(zh: boolean): StatsPreviewData {
  const kpis: StatsKpi[] = [
    { label: ["API 等价费用", "API-equivalent cost"], value: "$87.20", note: ["按公开价格折算", "Priced at public rates"] },
    { label: ["请求", "Requests"], value: "13,201", note: ["50 次失败", "50 failed"] },
    { label: ["对话 Token", "Conversation tokens"], value: "2.6B", note: ["输出 7M", "7M output"] },
    { label: ["缓存命中率", "Cache rate"], value: "95.7%", note: ["节省 82.2%", "82.2% saved"] },
    { label: ["错误率", "Error rate"], value: "0.4%", note: ["13,151 成功", "13,151 succeeded"] },
  ];
  const secondary: StatsKpi[] = [
    { label: ["未缓存输入", "Uncached input"], value: "109M", note: ["", ""] },
    { label: ["缓存读取", "Cache read"], value: "2.4B", note: ["", ""] },
    { label: ["缓存写入", "Cache write"], value: "915K", note: ["", ""] },
    { label: ["输出", "Output"], value: "7M", note: ["", ""] },
    { label: ["高级请求", "Premium requests"], value: "1", note: ["", ""] },
    { label: ["Token/s", "Tokens/s"], value: "35.2", note: ["", ""] },
    { label: ["平均时延", "Avg latency"], value: "15.7s", note: ["", ""] },
    { label: ["平均首字", "Avg TTFT"], value: "11.1s", note: ["", ""] },
  ];
  const tokenMix = [
    { label: ["未缓存输入", "Uncached input"] as const, share: 4.2 },
    { label: ["缓存读取", "Cache read"] as const, share: 94.9 },
    { label: ["缓存写入", "Cache write"] as const, share: 0.8 },
    { label: ["输出", "Output"] as const, share: 0.1 },
  ];
  const sources: StatsSource[] = [
    { label: ["主 Agent", "Main agent"], requests: 8_790, tokens: "2.3B", share: 89.2 },
    { label: ["子 Agent", "Subagents"], requests: 3_790, tokens: "267M", share: 10.4 },
    { label: ["进度摘要", "Progress"], requests: 554, tokens: "8.1M", share: 0.3 },
    { label: ["Composer", "Composer"], requests: 20, tokens: "1.6M", share: 0.1 },
    { label: ["回顾", "Recap"], requests: 9, tokens: "911K", share: 0.0 },
    { label: ["标题", "Title"], requests: 6, tokens: "29K", share: 0.0 },
    { label: ["思考", "Thinking"], requests: 31, tokens: "1.1K", share: 0.0 },
  ];
  const latest: StatsRequestRow[] = [
    { model: "deepseek-v4.1-flash", provider: "liufengzi", when: "1 分钟前", tokens: "512,118", cost: "$0.0043", duration: "21.6s", status: "ok" },
    { model: "deepseek-v4.1-flash", provider: "liufengzi", when: "1 分钟前", tokens: "510,602", cost: "$0.0037", duration: "8.6s", status: "ok" },
    { model: "deepseek-v4.1-flash", provider: "liufengzi", when: "1 分钟前", tokens: "442,757", cost: "$0.0049", duration: "19.8s", status: "ok" },
    { model: "deepseek-v4.1-flash", provider: "liufengzi", when: "2 分钟前", tokens: "0", cost: "$0", duration: "—", status: "failed" },
    { model: "claude-sonnet-4.5", provider: "anthropic", when: "3 分钟前", tokens: "504,825", cost: "$0.1508", duration: "19.3s", status: "ok" },
    { model: "gemini-3.6-flash", provider: "google", when: "5 分钟前", tokens: "388,204", cost: "$0.0021", duration: "6.4s", status: "ok" },
  ];
  const tables: Partial<Record<StatsTab, StatsTable>> = {
    models: {
      title: ["模型", "Models"],
      subtitle: ["按会话 Token 排序", "Ranked by conversation tokens"],
      columns: [["模型", "Model"], ["请求", "Requests"], ["Token", "Tokens"], ["费用", "Cost"], ["错误", "Errors"]],
      rows: [
        ["claude-sonnet-4.5", "8,140", "1.7B", "$52.61", "12"],
        ["deepseek-v4.1-flash", "3,980", "742M", "$14.08", "21"],
        ["gemini-3.6-flash", "861", "148M", "$9.74", "9"],
        ["gpt-5.2-codex", "180", "22M", "$8.42", "6"],
        ["其他", "40", "4.1M", "$2.35", "2"],
      ],
    },
    providers: {
      title: ["供应商", "Providers"],
      subtitle: ["含原生登录与自定义端点", "Native logins and custom endpoints included"],
      columns: [["供应商", "Provider"], ["模型", "Models"], ["请求", "Requests"], ["Token", "Tokens"], ["费用", "Cost"]],
      rows: [
        ["anthropic", "3", "8,140", "1.7B", "$52.61"],
        ["liufengzi", "1", "3,980", "742M", "$14.08"],
        ["google", "2", "861", "148M", "$9.74"],
        ["openai", "2", "180", "22M", "$8.42"],
      ],
    },
    costs: {
      title: ["费用", "Costs"],
      subtitle: ["按日汇总，单位美元", "Daily totals in USD"],
      columns: [["日期", "Date"], ["费用", "Cost"], ["请求", "Requests"], ["每千请求", "Per 1K requests"]],
      rows: [
        ["2026-02-18", "$7.88", "1,590", "$4.96"],
        ["2026-02-13", "$6.82", "1,380", "$4.94"],
        ["2026-02-08", "$7.15", "1,460", "$4.90"],
        ["2026-02-03", "$6.08", "1,240", "$4.90"],
        ["2026-01-29", "$5.28", "1,090", "$4.84"],
      ],
    },
    requests: {
      title: ["请求", "Requests"],
      subtitle: ["最近 24 小时", "Last 24 hours"],
      columns: [["时间", "When"], ["模型", "Model"], ["Token", "Tokens"], ["时延", "Duration"], ["状态", "Status"]],
      rows: [
        ["1 分钟前", "deepseek-v4.1-flash", "512,118", "21.6s", "OK"],
        ["1 分钟前", "deepseek-v4.1-flash", "510,602", "8.6s", "OK"],
        ["2 分钟前", "deepseek-v4.1-flash", "0", "—", "失败"],
        ["3 分钟前", "claude-sonnet-4.5", "504,825", "19.3s", "OK"],
        ["5 分钟前", "gemini-3.6-flash", "388,204", "6.4s", "OK"],
      ],
    },
    errors: {
      title: ["错误", "Errors"],
      subtitle: ["按失败原因分组", "Grouped by failure reason"],
      columns: [["原因", "Reason"], ["次数", "Count"], ["最近", "Latest"], ["模型", "Model"]],
      rows: [
        ["provider_timeout", "28", "1 分钟前", "deepseek-v4.1-flash"],
        ["rate_limited", "14", "18 分钟前", "gemini-3.6-flash"],
        ["context_overflow", "6", "2 小时前", "claude-sonnet-4.5"],
        ["tool_error", "2", "昨天", "gpt-5.2-codex"],
      ],
    },
    traces: {
      title: ["追踪", "Traces"],
      subtitle: ["每次请求的 span 摘要", "Span summary per request"],
      columns: [["追踪", "Trace"], ["耗时", "Duration"], ["Span", "Spans"], ["工具", "Tools"], ["状态", "Status"]],
      rows: [
        ["tr-8f21", "21.6s", "14", "read, edit, bash", "OK"],
        ["tr-8f1c", "8.6s", "6", "grep, read", "OK"],
        ["tr-8f04", "—", "1", "—", "失败"],
        ["tr-8ef9", "19.3s", "11", "edit, test", "OK"],
      ],
    },
    tools: {
      title: ["工具", "Tools"],
      subtitle: ["调用次数与失败率", "Calls and failure rate"],
      columns: [["工具", "Tool"], ["调用", "Calls"], ["失败", "Failures"], ["平均耗时", "Avg"]],
      rows: [
        ["read", "3,204", "2", "0.4s"],
        ["edit", "1,880", "9", "1.1s"],
        ["bash", "1,402", "14", "4.8s"],
        ["grep", "964", "0", "0.6s"],
        ["task", "212", "3", "38.2s"],
      ],
    },
    frustration: {
      title: ["挫败信号", "Frustration"],
      subtitle: ["重复澄清、打断与重试", "Repeated clarifications, interrupts and retries"],
      columns: [["信号", "Signal"], ["次数", "Count"], ["会话", "Sessions"], ["备注", "Note"]],
      rows: [
        ["重复澄清", "12", "5", "同一问题被再次提问"],
        ["手动打断", "8", "4", "用户停止当前回合"],
        ["重试", "6", "3", "同一请求连续两次失败"],
        ["计划被退回", "3", "2", "评审请求修改"],
      ],
    },
    projects: {
      title: ["项目", "Projects"],
      subtitle: ["按工作区汇总", "Aggregated per workspace"],
      columns: [["项目", "Project"], ["会话", "Sessions"], ["请求", "Requests"], ["Token", "Tokens"]],
      rows: [
        ["juling-harness", "18", "9,140", "2.1B"],
        ["juling-web", "12", "3,260", "412M"],
        ["docs-site", "4", "801", "88M"],
      ],
    },
    gain: {
      title: ["收益", "Gain"],
      subtitle: ["缓存与压缩省下的等价费用", "Equivalent cost saved by cache and compaction"],
      columns: [["来源", "Source"], ["节省", "Saved"], ["占比", "Share"]],
      rows: [
        ["缓存读取", "$71.42", "82.2%"],
        ["上下文压缩", "$7.36", "8.5%"],
        ["子 Agent 复用", "$4.10", "4.7%"],
        ["未节省", "$4.00", "4.6%"],
      ],
    },
    spotlight: {
      title: ["聚光", "Spotlight"],
      subtitle: ["单个请求的完整上下文", "Full context of one request"],
      columns: [["字段", "Field"], ["值", "Value"]],
      rows: [
        ["模型", "claude-sonnet-4.5"],
        ["上下文占用", "38% · 76k / 200k"],
        ["工具调用", "11"],
        ["缓存命中", "95.7%"],
        ["等价费用", "$0.1508"],
      ],
    },
  };
  return { kpis, secondary, activity: ACTIVITY, tokenMix, sources, latest, tables };
}

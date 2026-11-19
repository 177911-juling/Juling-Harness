/**
 * 进入应用时的全局提示（显示层，不进 Host / client-contract）。
 *
 * 「关闭」只收起本次会话；「不再提醒」把当前文案版本写入 localStorage。
 * 之后若要再提示一次，提高 STARTUP_NOTICE_ID 即可。
 */

export const STARTUP_NOTICE_ID = "iteration-preview-v1";
export const STARTUP_NOTICE_STORAGE_KEY = "omp.startupNotice.dismissed";
export const PROJECT_SITE_URL = "https://www.177911.com/apps";
export const PROJECT_SITE_HOST = "www.177911.com/apps";

export const STARTUP_NOTICE_COPY = {
  kicker: "迭代预告",
  title: "内测打磨阶段",
  body: "我们诚挚邀请开发者提交缺陷报告、提交标准化 Issue 记录问题，同时也十分欢迎各类场景化落地创意与功能优化提案。",
  hint: "可在 177911.com 查看进度，或在论坛参与讨论。",
  repoLabel: "项目地址",
  thanks: "感谢使用 Juling Harness。",
} as const;

export const STARTUP_NOTICE_COPY_EN = {
  kicker: "Iteration preview",
  title: "Internal beta · Polishing",
  body: "We sincerely invite developers to file defect reports and standardized issues, and warmly welcome scenario-driven ideas and feature proposals.",
  hint: "Track progress at 177911.com or join the discussion in the forum.",
  repoLabel: "Project site",
  thanks: "Thank you for trying Juling Harness.",
} as const;

export function getStartupNoticeCopy(zh: boolean) {
  return zh ? STARTUP_NOTICE_COPY : STARTUP_NOTICE_COPY_EN;
}

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* 存储被阻塞时「不再提醒」只活在本次会话。 */
  }
}

export function shouldShowStartupNotice(): boolean {
  return readStorage(STARTUP_NOTICE_STORAGE_KEY) !== STARTUP_NOTICE_ID;
}

export function dismissStartupNoticeForever(): void {
  writeStorage(STARTUP_NOTICE_STORAGE_KEY, STARTUP_NOTICE_ID);
}

/** 测试辅助：清掉持久化的「不再提醒」。 */
export function __resetStartupNoticeForTests(): void {
  try {
    globalThis.localStorage?.removeItem(STARTUP_NOTICE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

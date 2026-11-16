import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileViewerSettings } from "./FileViewerSettings";
import { readFileScope, saveFileScope } from "./filePreferences";
import { I18nProvider } from "../i18n";
import { PreviewModeProvider } from "../preview/PreviewContext";
import { selectOption } from "../test/selectOption";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it("keeps file scope usable and reports a failed preference write without blocking", () => {
  saveFileScope("conversation");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
  render(<PreviewModeProvider switchEnabled><I18nProvider forcedLanguage="zh"><FileViewerSettings /></I18nProvider></PreviewModeProvider>);
  const trigger = screen.getByRole("combobox", { name: "文件窗口默认归属" });
  expect(trigger.textContent).toContain("跟随来源对话");
  selectOption(trigger, "工作区共享");
  expect(trigger.textContent).toContain("工作区共享");
  expect(screen.getByRole("status").textContent).toContain("本次会话内仍会生效");
  expect(readFileScope()).toBe("workspace");
});

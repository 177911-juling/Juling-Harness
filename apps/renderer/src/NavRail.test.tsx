import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iconSvg } from "./icons";
import { I18nProvider } from "./i18n";
import { AppNavRail } from "./NavRail";
import { __resetAppSettingsForTests, getAppSettings } from "./settings/appSettings";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); __resetAppSettingsForTests(null); });

/** The shell owns the collapsed flag (the avatar falls back to the sidebar
 *  footer while the rail is away), so the tests hold it the same way. */
function StatefulRail({
  activeRoute = "home",
  profile = { displayName: "Ada", avatarSrc: "" },
  update = null,
  demo = false,
  theme = "light",
  onToggleTheme = vi.fn(),
  onNavigate = vi.fn(),
  onOpenUpdate = vi.fn(),
  onToggleMenu,
  menuOpen = false,
}: {
  activeRoute?: string;
  profile?: { displayName: string; avatarSrc: string };
  update?: { version?: string } | null;
  demo?: boolean;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  onNavigate?: () => void;
  onOpenUpdate?: () => void;
  onToggleMenu?: (anchor: HTMLButtonElement) => void;
  menuOpen?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <AppNavRail
      activeRoute={activeRoute}
      collapsed={collapsed}
      onToggleCollapsed={() => setCollapsed((value) => !value)}
      profile={profile}
      update={update}
      demo={demo}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onNavigate={onNavigate}
      onOpenUpdate={onOpenUpdate}
      menuOpen={menuOpen}
      {...(onToggleMenu === undefined ? {} : { onToggleMenu })}
    />
  );
}

function renderRail(options: {
  activeRoute?: string;
  profile?: { displayName: string; avatarSrc: string };
  update?: { version?: string } | null;
  demo?: boolean;
  theme?: "light" | "dark";
} = {}) {
  const onNavigate = vi.fn();
  const onOpenUpdate = vi.fn();
  const onToggleTheme = vi.fn();
  render(
    <I18nProvider forcedLanguage="en">
      <StatefulRail
        activeRoute={options.activeRoute ?? "home"}
        {...(options.profile === undefined ? {} : { profile: options.profile })}
        update={options.update ?? null}
        demo={options.demo ?? false}
        theme={options.theme ?? "light"}
        onToggleTheme={onToggleTheme}
        onNavigate={onNavigate}
        onOpenUpdate={onOpenUpdate}
      />
    </I18nProvider>,
  );
  return {
    nav: screen.getByRole("navigation", { name: "Primary" }),
    onNavigate,
    onOpenUpdate,
    onToggleTheme,
  };
}

describe("AppNavRail", () => {
  it("renders the nine destinations on top and theme/language controls in the bottom tool group, and marks the active route", () => {
    const { nav } = renderRail({ activeRoute: "home" });
    const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>(".app-rail-top .app-rail-btn"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Workbench",
      "Home",
      "History",
      "Capabilities",
      "Models",
      "Evaluation",
      "Media",
      "Settings",
      "Diagnostics",
    ]);
    const bottom = Array.from(nav.querySelectorAll<HTMLButtonElement>(".app-rail-bottom .app-rail-btn"));
    expect(bottom.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Check for Updates",
      "Language",
      "Theme",
    ]);
    expect(within(nav).getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("button", { name: "Workbench" }).getAttribute("aria-current")).toBeNull();
    expect(nav.querySelector<HTMLElement>(".app-rail-window")?.style.getPropertyValue("--rail-active-index")).toBe("1");
  });

  it("gives the workbench its own icon instead of the sidebar-region glyph", () => {
    /* `layout` is the titlebar's "toggle the left region" mark; a destination
       reusing it would read as the same command twice in one window. The
       workbench glyph keeps the outer frame but adds a second divider. */
    const svgInner = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      return host.querySelector("svg")?.innerHTML ?? "";
    };
    const { nav } = renderRail();
    const glyph = within(nav).getByRole("button", { name: "Workbench" }).querySelector("svg")?.innerHTML ?? "";
    expect(glyph).toBe(svgInner(iconSvg("workbench")));
    expect(glyph).not.toBe(svgInner(iconSvg("layout")));
  });

  it("navigates when a destination is clicked", () => {
    const { nav, onNavigate } = renderRail();
    fireEvent.click(within(nav).getByRole("button", { name: "History" }));
    expect(onNavigate).toHaveBeenCalledWith("history");
  });

  it("toggles the theme from the last rail entry and mirrors the current one", () => {
    const glyph = (html: string) => {
      const host = document.createElement("div");
      host.innerHTML = html;
      return host.querySelector("svg")?.innerHTML ?? "";
    };
    const light = renderRail({ theme: "light" });
    const lightTheme = within(light.nav).getByRole("button", { name: "Theme" });
    expect(lightTheme.getAttribute("aria-pressed")).toBe("false");
    expect(lightTheme.querySelector("svg")?.innerHTML).toBe(glyph(iconSvg("light")));
    fireEvent.click(lightTheme);
    expect(light.onToggleTheme).toHaveBeenCalledOnce();

    cleanup();
    const dark = renderRail({ theme: "dark" });
    const darkTheme = within(dark.nav).getByRole("button", { name: "Theme" });
    expect(darkTheme.getAttribute("aria-pressed")).toBe("true");
    expect(darkTheme.querySelector("svg")?.innerHTML).toBe(glyph(iconSvg("moon")));
  });

  it("picks one of six interface languages from the rail menu", () => {
    const { nav } = renderRail();
    fireEvent.click(within(nav).getByRole("button", { name: "Language" }));
    const options = screen.getAllByRole("menuitem");
    expect(options.map(option => option.textContent)).toEqual(["简体中文", "English", "Русский", "日本語", "한국어", "हिन्दी"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "日本語" }));
    expect(getAppSettings().language).toBe("ja");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("keeps the update entry visible and badges it only when an update exists", () => {
    const idle = renderRail();
    const check = within(idle.nav).getByRole("button", { name: "Check for Updates" });
    expect(check.querySelector(".app-rail-notice")).toBeNull();
    fireEvent.click(check);
    expect(idle.onOpenUpdate).toHaveBeenCalledOnce();

    cleanup();
    const { nav, onOpenUpdate } = renderRail({ update: { version: "1.2.3" }, demo: true });
    const update = within(nav).getByRole("button", { name: "New version available v1.2.3 (Demo)" });
    expect(update.querySelector(".app-rail-notice")).not.toBeNull();
    fireEvent.click(update);
    expect(onOpenUpdate).toHaveBeenCalledOnce();
  });

  it("uses the profile initial or avatar and opens Home", () => {
    const { nav, onNavigate } = renderRail();
    const avatar = within(nav).getByRole("button", { name: "Ada · Account" });
    expect(avatar.textContent).toBe("A");
    fireEvent.click(avatar);
    expect(onNavigate).toHaveBeenCalledWith("home");
  });

  it("renders an uploaded avatar image", () => {
    const { nav } = renderRail({
      profile: { displayName: "Ada", avatarSrc: "data:image/png;base64,QQ==" },
    });
    const image = nav.querySelector<HTMLImageElement>(".app-rail-avatar img");
    expect(image?.getAttribute("src")).toBe("data:image/png;base64,QQ==");
  });

  it("collapses off the layout and expands again from the same handle", () => {
    renderRail();
    const handle = screen.getByRole("button", { name: "Collapse navigation" });
    fireEvent.click(handle);
    /* The column stays mounted for the width transition but leaves the tree, so
       the landmark is gone for assistive tech while the handle stays operable. */
    expect(screen.queryByRole("navigation", { name: "Primary" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show navigation" }));
    const reopened = screen.getByRole("navigation", { name: "Primary" });
    expect(within(reopened).getByRole("button", { name: "Workbench" })).toBeTruthy();
  });

  it("reveals the handle after the window shell attaches a detached navigation host", async () => {
    const notifyResize: Array<() => void> = [];
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize.push(() => callback([], this as unknown as ResizeObserver));
      }
      observe() {}
      disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.isConnected ? new DOMRect(0, 36, 56, 684) : new DOMRect();
    });
    const host = document.createElement("div");
    render(createPortal(<I18nProvider forcedLanguage="en"><StatefulRail /></I18nProvider>, host));
    try {
      document.body.append(host);
      act(() => { for (const notify of notifyResize) notify(); });
      fireEvent.pointerMove(window, { clientX: 56, clientY: 400 });
      const handle = screen.getByRole("button", { name: "Collapse navigation" });
      await waitFor(() => expect(handle.classList.contains("is-near")).toBe(true));
      fireEvent.click(handle);
      expect(screen.getByRole("button", { name: "Show navigation" })).toBe(handle);
      fireEvent.click(handle);
      expect(screen.getByRole("navigation", { name: "Primary" })).toBeTruthy();
    } finally {
      host.remove();
    }
  });

  it("hands the environment-menu anchor back to the shell", () => {
    /* The same control also lives in the sidebar footer; the shell needs to know
       which node was clicked to place the menu against it. */
    const onToggleMenu = vi.fn();
    const onNavigate = vi.fn();
    render(
      <I18nProvider forcedLanguage="en">
        <StatefulRail onToggleMenu={onToggleMenu} onNavigate={onNavigate} menuOpen={false} />
      </I18nProvider>,
    );
    const avatar = screen.getByRole("button", { name: "Ada · Account" });
    expect(avatar.getAttribute("aria-haspopup")).toBe("menu");
    expect(avatar.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(avatar);
    expect(onToggleMenu).toHaveBeenCalledOnce();
    expect(onToggleMenu.mock.calls[0]?.[0]).toBe(avatar);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

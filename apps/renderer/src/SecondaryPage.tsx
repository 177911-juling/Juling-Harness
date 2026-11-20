import { useRef, type ReactNode } from "react";
import { pageDir, pagePhaseClass, useDeferredKey } from "./pageTransition";

export type PageRoute = "home" | "workbench" | "history" | "agent-hub" | "capabilities" | "model-config" | "settings" | "diagnostics" | "media" | "evaluation" | "statistics";

/** 页面顺序只决定入场/离场方向：同级页面按 rail 里的先后，后来的从右进、
 *  先前的从左进（见 styles/motion.css 的「Space」）。导航入口只在
 *  `AppNavRail` 一处，页头不再复制一份标签行。 */
const PAGE_ORDER: ReadonlyArray<PageRoute> = [
  "workbench",
  "home",
  "history",
  "capabilities",
  "model-config",
  "evaluation",
  "media",
  "settings",
  "diagnostics",
];

function pageOrder(route: PageRoute): number {
  // Statistics opens from the home page's token card and returns to it.
  if (route === "statistics") return pageOrder("home") + 0.5;
  const at = PAGE_ORDER.indexOf(route);
  return at < 0 ? PAGE_ORDER.length : at;
}

export function SecondaryPage({
  route,
  className,
  children,
}: {
  route: PageRoute;
  className?: string;
  children: ReactNode;
}) {
  const heldChildren = useRef(children);
  const { shown, phase, dir } = useDeferredKey(route, pageOrder);
  if (route === shown) heldChildren.current = children;
  const body = route === shown ? children : heldChildren.current;
  const bodyMotionLive = useRef(false);
  if (!Object.is(route, shown)) bodyMotionLive.current = true;
  const bodyPhase = bodyMotionLive.current ? phase : null;

  return (
    <div className={className ? `page ${className}` : "page"} id="pageRoot">
      <div
        className={bodyPhase ? `page-body ${pagePhaseClass(bodyPhase)}` : "page-body"}
        data-page-axis="x"
        data-page-dir={pageDir(dir)}
        id="pageBody"
        tabIndex={-1}
        data-route={shown}
      >
        {body}
      </div>
    </div>
  );
}

"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** True for every Control Center route (`/{locale}/portal/control-center/**`). */
export function isControlCenterPath(pathname: string | null | undefined) {
  return /^\/[a-z]{2}\/portal\/control-center(\/|$)/.test(pathname ?? "");
}

// The Control Center is an application with its own compact top bar (brand, language, account) and skip link.
// The public site's header, marketing footer and skip link do not belong inside administrative workflows.
export function HideInControlCenter({ children }: { children: ReactNode }) {
  return isControlCenterPath(usePathname()) ? null : <>{children}</>;
}

/** The site's main landmark. The Control Center renders its own `main` beside its navigation, so it is not nested. */
export function SiteMain({ children }: { children: ReactNode }) {
  return isControlCenterPath(usePathname()) ? <div id="main">{children}</div> : <main id="main" tabIndex={-1}>{children}</main>;
}

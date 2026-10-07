"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** True for the authenticated portal (`/{locale}/portal/**`), staff and patients alike. */
export function isPortalPath(pathname: string | null | undefined) {
  return /^\/[a-z]{2}\/portal(\/|$)/.test(pathname ?? "");
}

// One rule by route (owner decision, GATE P2-2): every portal page ends on the slim app footer, every public page
// keeps the marketing footer. The route decides, so the server never needs to know who is signed in.
export function FooterSwitch({ portal, children }: { portal: ReactNode; children: ReactNode }) {
  return <>{isPortalPath(usePathname()) ? portal : children}</>;
}

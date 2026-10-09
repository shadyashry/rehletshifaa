"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// "Send my case" steps aside where it would mislead: on the case form itself (it would only link back to the page being
// filled in) and on a patient's own secure links (`/proposal/…`, `/status/…`), whose reader already has a case.
export function HideOnCaseForm({ locale, children }: { locale: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const hidden = pathname === `/${locale}/send-my-case` || pathname.startsWith(`/${locale}/proposal/`) || pathname.startsWith(`/${locale}/status/`);
  return hidden ? null : <>{children}</>;
}

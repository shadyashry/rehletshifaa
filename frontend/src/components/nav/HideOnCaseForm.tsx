"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// On the case form itself the header's "Start my case" would only link back to the page the patient is
// already filling in, so it steps aside there.
export function HideOnCaseForm({ locale, children }: { locale: string; children: ReactNode }) {
  const pathname = usePathname();
  return pathname === `/${locale}/send-my-case` ? null : <>{children}</>;
}

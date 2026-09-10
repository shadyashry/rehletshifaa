"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Hides marketing navigation chrome on the pages a patient is already inside: the authenticated
// portal, and the secure activation journey. On activation the header CTA ("Start my case") would
// otherwise sit beside the one thing that matters as a louder invitation to do something else.
// Scoped to the header only — other pages keep the full navigation.
export function HideOnPortal({ locale, children }: { locale: string; children: ReactNode }) {
  const pathname = usePathname();
  const inPatientJourney =
    pathname === `/${locale}/portal` || pathname.startsWith(`/${locale}/portal/`) ||
    pathname.startsWith(`/${locale}/activate/`);
  return inPatientJourney ? null : <>{children}</>;
}

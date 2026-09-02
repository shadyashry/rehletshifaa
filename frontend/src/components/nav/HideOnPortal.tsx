"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Hides marketing navigation chrome while inside the authenticated portal
// (/{locale}/portal and any nested routes). Scoped to the header only — other
// pages keep the full navigation.
export function HideOnPortal({ locale, children }: { locale: string; children: ReactNode }) {
  const pathname = usePathname();
  const inPortal = pathname === `/${locale}/portal` || pathname.startsWith(`/${locale}/portal/`);
  return inPortal ? null : <>{children}</>;
}

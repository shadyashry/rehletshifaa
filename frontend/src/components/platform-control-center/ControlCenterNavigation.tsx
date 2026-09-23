"use client";

import type { Locale } from "@/lib/i18n";
import { useControlCenterAccess } from "./control-center-access";
import { ccHref, openableSections } from "./control-center-nav";

/**
 * The single way into the Control Center from a workspace: one persistent entry (in the account menu), offered only
 * when the caller can open at least one Control Center area (exact capability keys, or the legacy administration
 * role check the backend applies). Hiding the entry never replaces the backend's authorization.
 */
export function useControlCenterEntry(locale: Locale): { href: string; label: string } | null {
  const access = useControlCenterAccess();
  if (access.loading || !openableSections(access).length) return null;
  return { href: ccHref(locale), label: locale === "ar" ? "مركز التحكم" : "Control Center" };
}

"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useControlCenterAccess } from "./control-center-access";
import { NAV_ITEMS, ccHref } from "./control-center-nav";

/**
 * The single way into the Control Center from the portal. Shown only when the caller can use at least one
 * Control Center area (exact capability keys, or the legacy administration role check the backend applies).
 */
export function ControlCenterNavigation({ locale }: { locale: Locale }) {
  const access = useControlCenterAccess();
  const allowed = !access.loading && NAV_ITEMS.some((i) => i.key !== "overview" && i.visible(access));
  return allowed ? <Link className="btn-secondary my-3 inline-flex items-center gap-2" href={ccHref(locale)}><LayoutDashboard size={16} aria-hidden />{locale === "ar" ? "مركز التحكم" : "Control Center"}</Link> : null;
}

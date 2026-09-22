"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Route } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { journeyCopy } from "./journey-copy";

/**
 * Sidebar entry into Journey Management. Journeys, Versions, Designer, Validation, Simulation,
 * comparison and publish governance are all reached through one journey's own context (a journey
 * has no meaning without first picking it), so — matching the existing Provider Organizations nav
 * precedent, not Access Governance's flat-tab precedent — this is a single list entry point rather
 * than several ungrounded deep links. Hidden entirely unless the caller holds journey.view, same
 * fail-closed /admin/access/me pattern as every other Control Center nav section.
 */
export function JourneyManagementNav({ locale, active }: { locale: Locale; active?: boolean }) {
  const t = journeyCopy[locale];
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true; setAllowed(false);
    if (user) void apiFetchAs(user.access_token, "/admin/access/me").then(async (r) => {
      if (!r.ok) return;
      const decisions = await r.json() as { permission: string; allowed: boolean }[];
      if (active) setAllowed(decisions.some((d) => d.permission === "journey.view" && d.allowed));
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);
  if (!allowed) return null;
  return (
    <>
      <h2>{t.navJourneys}</h2>
      <ul>
        <li><Link href={`/${locale}/portal/journeys`} aria-current={active ? "page" : undefined}><Route size={16} aria-hidden /> {t.journeyList}</Link></li>
      </ul>
    </>
  );
}

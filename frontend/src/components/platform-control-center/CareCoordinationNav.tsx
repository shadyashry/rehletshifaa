"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Route as RouteIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { coordCopy } from "./coordination-copy";

const VIEW_PERMISSIONS = ["assignment.team.view", "assignment.policy.view", "assignment.queue.manage", "assignment.audit.view", "assignment.simulate"];

/**
 * Sidebar entry into Care Coordination. Like Journeys, coordination is hierarchical (organization ->
 * teams/preferences/policy/simulation/queue/audit), so this follows the same single-list-entry-point
 * precedent as JourneyManagementNav rather than Access Governance's flat deep-linked tabs. Hidden
 * entirely unless the caller holds at least one of the "view" capabilities in the assignment family —
 * fail-closed, same backend-derived-navigation pattern as every other Control Center nav section.
 */
export function CareCoordinationNav({ locale, active }: { locale: Locale; active?: boolean }) {
  const t = coordCopy[locale];
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true; setAllowed(false);
    if (user) void apiFetchAs(user.access_token, "/admin/access/me").then(async (r) => {
      if (!r.ok) return;
      const decisions = await r.json() as { permission: string; allowed: boolean }[];
      if (live) setAllowed(decisions.some((d) => VIEW_PERMISSIONS.includes(d.permission) && d.allowed));
    }).catch(() => {});
    return () => { live = false; };
  }, [user]);
  if (!allowed) return null;
  return (
    <>
      <h2>{t.navCoordination}</h2>
      <ul>
        <li><Link href={`/${locale}/portal/control-center/coordination`} aria-current={active ? "page" : undefined}><RouteIcon size={16} aria-hidden /> {t.navCoordination}</Link></li>
      </ul>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck, Eye, History } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ccCopy } from "./control-center-copy";

/**
 * Sidebar deep links into the existing, previously-accepted Access Governance page
 * (AccessGovernance.tsx) — never a second implementation of roles/permissions/assignments/
 * effective access/simulation/audit. Hidden entirely unless the caller actually holds
 * access.role.view, matching AccessGovernance.tsx's own fail-closed gate and the same
 * backend-derived-navigation pattern AccessNavigation.tsx/ControlCenterNavigation.tsx use.
 */
export function AccessGovernanceNav({ locale }: { locale: Locale }) {
  const t = ccCopy[locale];
  const { user } = useAuth();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true; setAllowed(false);
    if (user) void apiFetchAs(user.access_token, "/admin/access/me").then(async (r) => {
      if (!r.ok) return;
      const decisions = await r.json() as { permission: string; allowed: boolean }[];
      if (active) setAllowed(decisions.some((d) => d.permission === "access.role.view" && d.allowed));
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);
  if (!allowed) return null;
  const base = `/${locale}/portal/access`;
  return (
    <>
      <h2>{t.nav.access}</h2>
      <ul>
        <li><Link href={`${base}?tab=roles`}><ShieldCheck size={16} aria-hidden /> {t.accessRoles}</Link></li>
        <li><Link href={`${base}?tab=permissions`}><KeyRound size={16} aria-hidden /> {t.accessPermissions}</Link></li>
        <li><Link href={`${base}?tab=effective`}><Eye size={16} aria-hidden /> {t.accessEffective}</Link></li>
        <li><Link href={`${base}?tab=audit`}><History size={16} aria-hidden /> {t.accessAudit}</Link></li>
      </ul>
    </>
  );
}

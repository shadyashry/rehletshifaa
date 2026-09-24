"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { orgStatusLabel, orgTypeLabel } from "./control-center-copy";
import { coordCopy } from "./coordination-copy";

type OrganizationSummary = { id: string; displayName: string; type: string; status: string };

export function CareCoordinationOrganizations({ locale }: { locale: Locale }) {
  const t = coordCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const loadError = locale === "ar" ? "تعذّر تحميل الجهات. حاول مجددًا." : "We couldn't load the organizations. Try again.";

  useEffect(() => {
    if (!user) return;
    let live = true;
    apiFetchAs(user.access_token, "/admin/coordination/organizations").then(async (response) => {
      if (!response.ok) { if (response.status !== 403) throw new Error(loadError); if (live) { setOrgs([]); setDenied(true); } return; }
      const list = await response.json();
      if (live) { setError(""); setDenied(false); setOrgs(list); }
    }).catch((e) => { if (live) setError(e instanceof Error ? e.message : loadError); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [user, loadError]);
  // One organization: no picker hop — open its Coordination Setup directly.
  const only = !loading && !error && !denied && orgs.length === 1 ? orgs[0].id : null;
  useEffect(() => { if (only) router.replace(`/${locale}/portal/control-center/coordination/${only}`); }, [only, router, locale]);

  const filtered = orgs.filter((o) => (o.displayName + " " + o.type).toLowerCase().includes(query.toLowerCase()));

  if (authLoading || (loading && !!user) || only) return <ControlCenterShell locale={locale} active="coordination" title={t.navCoordination} intro={t.orgListIntro}><p role="status">{only ? t.opening : t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="coordination" title={t.navCoordination} intro={t.orgListIntro}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;

  return (
    <ControlCenterShell locale={locale} active="coordination" title={t.navCoordination} intro={t.orgListIntro}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {error ? null : denied ? <p className="cc-empty">{t.denied}</p> : !orgs.length ? <p className="cc-empty">{t.noOrganizations}</p> : (
        <>
          <div className="cc-toolbar"><label>{t.search}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
          <ul className="cc-cards">
            {filtered.map((o) => (
              <li key={o.id} className="cc-card">
                <Link className="cc-card-link" href={`/${locale}/portal/control-center/coordination/${o.id}`}>
                  <div><h3>{o.displayName}</h3><p className="cc-meta">{orgTypeLabel(o.type, locale)}</p></div>
                  <span className="cc-badge">{orgStatusLabel(o.status, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </ControlCenterShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy, orgStatusLabel, orgTypeLabel } from "./control-center-copy";
import { coordCopy } from "./coordination-copy";

type OrganizationSummary = { id: string; displayName: string; type: string; status: string };

export function CareCoordinationOrganizations({ locale }: { locale: Locale }) {
  const t = coordCopy[locale]; const cc = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const response = await apiFetchAs(user.access_token, "/admin/coordination/organizations");
      if (!response.ok) { if (response.status === 403) { setOrgs([]); return; } throw new Error(t.error); }
      setOrgs(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = orgs.filter((o) => (o.displayName + " " + o.type).toLowerCase().includes(query.toLowerCase()));

  const crumbs = [{ label: cc.breadcrumbHome, href: `/${locale}/portal/control-center` }, { label: t.navCoordination }];
  const actions = <button type="button" className="cc-secondary" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.retry}</button>;

  if (authLoading || loading) return <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.loading}><p role="status">{t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.orgList}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;

  return (
    <ControlCenterShell locale={locale} active="coordination" crumbs={crumbs} title={t.orgList} actions={actions}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!orgs.length ? <p className="cc-empty">{t.denied}</p> : (
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

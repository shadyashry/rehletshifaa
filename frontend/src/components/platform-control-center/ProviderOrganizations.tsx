"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy, orgStatusLabel, orgTypeLabel } from "./control-center-copy";

type OrganizationView = { id: string; legalName: string; businessName: string; displayName: string; type: string; status: string; countryCode: string; timeZone: string; defaultCurrency: string; legacyMappingStatus: string; version: number };
type Decision = { permission: string; allowed: boolean };
const orgTypes = ["HOSPITAL", "CLINIC", "SOLO_PRACTICE", "DIAGNOSTIC_CENTER"];

export function ProviderOrganizations({ locale }: { locale: Locale }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationView[]>([]);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [type, setType] = useState(orgTypes[0]);
  const [countryCode, setCountryCode] = useState("AE");
  const [timeZone, setTimeZone] = useState("Asia/Dubai");
  const [currency, setCurrency] = useState("AED");

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/providers" + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "REAUTHENTICATION_REQUIRED") { await signIn(true); throw new Error(t.denied); }
      throw new Error(response.status === 403 ? t.denied : t.error);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if ((decisions as Decision[]).some((d) => d.permission === "provider.view" && d.allowed)) {
        setOrgs(await api<OrganizationView[]>(""));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = orgs.filter((o) => (o.displayName + " " + o.legalName + " " + o.type).toLowerCase().includes(query.toLowerCase()));

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api<OrganizationView>("", "POST", { legalName, businessName: legalName, displayName, type, countryCode, timeZone, defaultCurrency: currency });
      setCreating(false); setLegalName(""); setDisplayName("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const actions = (
    <div className="cc-toolbar" style={{ margin: 0 }}>
      <button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.refresh}</button>
      {allowed("provider.create") && <button type="button" onClick={() => setCreating(true)}><Plus size={16} aria-hidden />{t.newOrg}</button>}
    </div>
  );

  return (
    <ControlCenterShell locale={locale} active="providers" crumbs={[{ label: t.breadcrumbHome, href: `/${locale}/portal/control-center` }, { label: t.breadcrumbProviders }]} title={t.orgList} intro={t.intro} actions={actions}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && !allowed("provider.view") && <p>{t.denied}</p>}
      {!authLoading && user && !loading && allowed("provider.view") && (
        <>
          {creating && (
            <form className="cc-card" onSubmit={submitCreate} style={{ marginBottom: 20 }} aria-label={t.newOrg}>
              <label>{t.type}<select value={type} onChange={(e) => setType(e.target.value)}>{orgTypes.map((v) => <option key={v} value={v}>{orgTypeLabel(v, locale)}</option>)}</select></label>
              <label>{locale === "ar" ? "الاسم القانوني" : "Legal name"}<input required maxLength={200} value={legalName} onChange={(e) => setLegalName(e.target.value)} /></label>
              <label>{locale === "ar" ? "اسم العرض" : "Display name"}<input required maxLength={160} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
              <div className="cc-toolbar">
                <label>{t.country}<input required maxLength={2} dir="ltr" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} /></label>
                <label>{locale === "ar" ? "المنطقة الزمنية" : "Time zone"}<input required dir="ltr" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} /></label>
                <label>{t.currency}<input required maxLength={3} dir="ltr" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></label>
              </div>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setCreating(false)}>{t.cancel}</button>
                <button disabled={busy || !legalName || !displayName}>{t.save}</button>
              </div>
            </form>
          )}
          <div className="cc-toolbar">
            <label>{t.search}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          </div>
          {!filtered.length ? (
            <p className="cc-empty">{orgs.length ? t.empty : t.empty}</p>
          ) : (
            <ul className="cc-cards">
              {filtered.map((o) => (
                <li key={o.id} className="cc-card">
                  <Link className="cc-card-link" href={`/${locale}/portal/control-center/providers/${o.id}`}>
                    <div>
                      <h3>{o.displayName}</h3>
                      <p className="cc-meta">{o.legalName}</p>
                      <p className="cc-meta">{orgTypeLabel(o.type, locale)} · {o.countryCode} · {o.defaultCurrency}</p>
                    </div>
                    <span className="cc-badge">{orgStatusLabel(o.status, locale)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="cc-meta"><Search size={14} aria-hidden style={{ verticalAlign: "middle" }} /> {locale === "ar" ? "تعرض هذه القائمة المؤسسات التي لديك عضوية نشطة فيها فقط." : "This list shows only organizations where you hold an active membership."}</p>
        </>
      )}
    </ControlCenterShell>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy, credentialStatusLabel } from "./control-center-copy";

type OrganizationView = { id: string; displayName: string };
type RevisionView = {
  id: string; dossierId: string; organizationId: string; practitionerId: string; ownerSubject: string;
  credentialType: string; revisionNumber: number; policyVersionId: string; status: string; dossierStatus: string;
  expiresAt: string | null; submittedBy: string; submittedAt: string; version: number; evidenceIds: string[];
};
type Decision = { permission: string; allowed: boolean };

/**
 * Cross-organization credential verification queue. The backend only exposes a per-organization
 * queue (`GET /admin/providers/{id}/credential-reviews`, gated on `credential.review`), so this
 * aggregates the real per-org queues for every organization the caller can see — orgs the caller
 * cannot review simply return nothing, exactly matching the backend's own authorization boundary.
 */
export function CredentialQueue({ locale, initialOrg }: { locale: Locale; initialOrg?: string }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationView[]>([]);
  const [rows, setRows] = useState<RevisionView[]>([]);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orgFilter, setOrgFilter] = useState(initialOrg ?? "");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions: Decision[] = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      const organizations: OrganizationView[] = await apiFetchAs(user.access_token, "/admin/providers").then((r) => (r.ok ? r.json() : []));
      setOrgs(organizations);
      const perOrg = await Promise.allSettled(organizations.map((o) =>
        apiFetchAs(user.access_token, `/admin/providers/${o.id}/credential-reviews`).then((r) => (r.ok ? (r.json() as Promise<RevisionView[]>) : Promise.reject(new Error(String(r.status)))))
      ));
      const combined = perOrg.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      combined.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
      setRows(combined);
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const orgName = (id: string) => orgs.find((o) => o.id === id)?.displayName ?? id;
  const types = Array.from(new Set(rows.map((r) => r.credentialType))).sort();
  const filtered = rows.filter((r) =>
    (!orgFilter || r.organizationId === orgFilter) &&
    (!typeFilter || r.credentialType === typeFilter) &&
    (!statusFilter || r.status === statusFilter)
  );

  return (
    <ControlCenterShell locale={locale} active="operations"
      crumbs={[{ label: t.breadcrumbHome, href: `/${locale}/portal/control-center` }, { label: t.breadcrumbCredentials }]}
      title={t.credentialQueue} intro={t.intro}
      actions={<button type="button" className="cc-secondary" onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.refresh}</button>}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {(authLoading || loading) && <p role="status">{t.loading}</p>}
      {!authLoading && !user && <button onClick={() => void signIn()}>{t.signin}</button>}
      {!authLoading && user && !loading && (
        <>
          <div className="cc-filterbar">
            <label>{t.filterOrg}
              <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                <option value="">{t.allOrgs}</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
              </select>
            </label>
            <label>{t.filterType}
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">{t.allTypes}</option>
                {types.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>{t.filterStatus}
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">{t.allStatuses}</option>
                {["SUBMITTED", "UNDER_REVIEW"].map((v) => <option key={v} value={v}>{credentialStatusLabel(v, locale)}</option>)}
              </select>
            </label>
          </div>
          {!filtered.length ? (
            <p className="cc-empty">{t.credentialQueueEmpty}</p>
          ) : (
            <ul className="cc-table" role="list" aria-label={t.credentialQueue}>
              {filtered.map((r) => (
                <li key={r.id}>
                  <span><bdi>{orgName(r.organizationId)}</bdi><br /><small>{r.credentialType} · #{r.revisionNumber}</small></span>
                  <span><bdi>{r.ownerSubject}</bdi><br /><small>{t.submitted} {new Date(r.submittedAt).toLocaleDateString(locale)}</small></span>
                  <span>{r.expiresAt ? <>{t.expires} {new Date(r.expiresAt).toLocaleDateString(locale)}</> : null}</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="cc-badge">{credentialStatusLabel(r.status, locale)}</span>
                    {allowed("credential.review") && (
                      <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/credentials/${r.organizationId}/${r.id}`}>{t.review}</Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </ControlCenterShell>
  );
}

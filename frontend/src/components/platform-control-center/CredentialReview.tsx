"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy, credentialStatusLabel } from "./control-center-copy";

type RevisionView = {
  id: string; dossierId: string; organizationId: string; practitionerId: string; ownerSubject: string;
  credentialType: string; revisionNumber: number; policyVersionId: string; status: string; dossierStatus: string;
  expiresAt: string | null; submittedBy: string; submittedAt: string; version: number; evidenceIds: string[];
};
type Onboarding = { organizationId: string; practitionerId: string; clinicianType: string; status: string; jurisdiction: string; version: number; ownerSubject: string };
type Decision = { permission: string; allowed: boolean };

const decisionsForStatus: Record<string, string[]> = {
  SUBMITTED: ["START_REVIEW"],
  UNDER_REVIEW: ["VERIFY", "REQUEST_INFORMATION", "REJECT"],
  VERIFIED: ["SUSPEND"],
  SUSPENDED: ["RESTORE"],
};
const decisionLabelKey: Record<string, "startReview" | "verify" | "requestInformation" | "reject" | "suspend" | "restore"> = {
  START_REVIEW: "startReview", VERIFY: "verify", REQUEST_INFORMATION: "requestInformation", REJECT: "reject", SUSPEND: "suspend", RESTORE: "restore",
};

export function CredentialReview({ locale, organizationId, revisionId }: { locale: Locale; organizationId: string; revisionId: string }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [row, setRow] = useState<RevisionView | null | "not-found">(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [documentBusy, setDocumentBusy] = useState<string | null>(null);

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions: Decision[] = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      const response = await apiFetchAs(user.access_token, `/admin/providers/${organizationId}/credential-reviews/${revisionId}`);
      if (response.status === 404 || response.status === 403) { setRow("not-found"); return; }
      if (!response.ok) throw new Error(t.error);
      const revision: RevisionView = await response.json();
      setRow(revision);
      const ob = await apiFetchAs(user.access_token, `/admin/providers/${organizationId}/clinicians/${revision.practitionerId}/onboarding`);
      if (ob.ok) setOnboarding(await ob.json());
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [user, t.error, organizationId, revisionId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const viewDocument = async (evidenceId: string) => {
    if (!user) return;
    setDocumentBusy(evidenceId); setError("");
    try {
      const response = await apiFetchAs(user.access_token, `/admin/providers/${organizationId}/credential-evidence/${evidenceId}/view`);
      if (!response.ok) throw new Error(t.error);
      const access: { url: string } = await response.json();
      window.open(access.url, "_blank", "noopener,noreferrer");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setDocumentBusy(null); }
  };

  const decide = async (decision: string) => {
    if (!row || row === "not-found") return;
    if (decision !== "START_REVIEW" && !reason.trim()) { setError(t.decisionReasonRequired); return; }
    setBusy(true); setError("");
    try {
      const response = await apiFetchAs(user!.access_token, `/admin/providers/${organizationId}/credential-reviews/${revisionId}/decision`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ decision, reason: reason.trim() || null, version: row.version }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || t.error);
      }
      setRow(await response.json());
      setReason("");
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const crumbs = [
    { label: t.breadcrumbHome, href: `/${locale}/portal/control-center` },
    { label: t.breadcrumbCredentials, href: `/${locale}/portal/control-center/credentials` },
    { label: t.breadcrumbReview },
  ];

  if (authLoading || (loading && row === null)) return <ControlCenterShell locale={locale} active="operations" crumbs={crumbs} title={t.loading}><p role="status">{t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="operations" crumbs={crumbs} title={t.credentialReview}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;

  const isSelf = row !== "not-found" && row !== null && user.profile.sub === row.ownerSubject;
  const isSubmitter = row !== "not-found" && row !== null && user.profile.sub === row.submittedBy;
  const available = row !== "not-found" && row !== null ? (decisionsForStatus[row.status] ?? []) : [];

  return (
    <ControlCenterShell locale={locale} active="operations" crumbs={crumbs} title={t.credentialReview}
      actions={<button type="button" className="cc-secondary" onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.refresh}</button>}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!allowed("credential.view") ? <p>{t.denied}</p> : row === "not-found" ? <p className="cc-empty">{t.credentialDetailNotFound}</p> : !row ? null : (
        <>
          <section className="cc-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}><bdi>{row.ownerSubject}</bdi></h2>
            <p className="cc-meta">{t.credentialType}: {row.credentialType} · #{row.revisionNumber}{onboarding ? <> · {onboarding.clinicianType}</> : null}</p>
            <p className="cc-meta">{t.submitted} {new Date(row.submittedAt).toLocaleString(locale)}{row.expiresAt ? <> · {t.expires} {new Date(row.expiresAt).toLocaleDateString(locale)}</> : null}</p>
            <span className="cc-badge">{credentialStatusLabel(row.status, locale)}</span>
          </section>

          <section className="cc-card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t.evidence}</h3>
            {!row.evidenceIds.length ? <p className="cc-empty">{t.noEvidence}</p> : (
              <ul className="cc-doc-list">
                {row.evidenceIds.map((id) => (
                  <li key={id}>
                    <span><bdi>{id}</bdi></span>
                    <button type="button" className="cc-secondary" disabled={documentBusy === id} onClick={() => void viewDocument(id)}>
                      <ExternalLink size={16} aria-hidden />{documentBusy === id ? t.openingDocument : t.viewDocument}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cc-card">
            <h3 style={{ marginTop: 0 }}>{t.review}</h3>
            {isSelf && <p role="alert" className="cc-message">{t.selfVerificationBlocked}</p>}
            {!isSelf && isSubmitter && <p role="alert" className="cc-message">{t.submitterReviewBlocked}</p>}
            {!available.length ? <p className="cc-empty">{t.noSelection}</p> : (isSelf || isSubmitter) ? null : (
              <>
                <label>{t.decisionReason}
                  <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                </label>
                <div className="cc-toolbar">
                  {available.map((d) => (
                    allowed(d === "START_REVIEW" ? "credential.review" : d === "VERIFY" ? "credential.verify" : d === "REQUEST_INFORMATION" ? "credential.request_information" : d === "REJECT" ? "credential.reject" : "credential.suspend") && (
                      <button key={d} type="button" disabled={busy} onClick={() => void decide(d)}>{t[decisionLabelKey[d]]}</button>
                    )
                  ))}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </ControlCenterShell>
  );
}

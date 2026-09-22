"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { ccCopy, invitationLabel, memberStatusLabel, onboardingStatusLabel, orgStatusLabel, orgTypeLabel, relationshipTypeLabel, roleLabel } from "./control-center-copy";

type StepStatus = "complete" | "inprogress" | "blocked" | "needsaction" | "verified" | "ready";
const stepBadgeKey: Record<StepStatus, "stepComplete" | "stepInProgress" | "stepBlocked" | "stepNeedsAction" | "stepVerified" | "stepReady"> = {
  complete: "stepComplete", inprogress: "stepInProgress", blocked: "stepBlocked", needsaction: "stepNeedsAction", verified: "stepVerified", ready: "stepReady",
};

type OrganizationView = { id: string; legalName: string; businessName: string; displayName: string; type: string; status: string; countryCode: string; timeZone: string; defaultCurrency: string; legacyMappingStatus: string; version: number };
type MemberView = { subject: string; kind: "CLINICIAN" | "PRACTICE_STAFF"; practitionerId: string | null; status: string; effectiveFrom: string; effectiveTo: string | null; invitationStatus: string; revision: number; roles: string[] };
type RelationshipView = { id: string; subject: string; type: string; targetPractitionerId: string; status: string; revision: number };
type ProviderDetail = { organization: OrganizationView; members: MemberView[]; relationships: RelationshipView[] };
type Blocker = { code: string; message: string };
type Readiness = { identityProvisioned: boolean; organizationMembershipActive: boolean; providerProfileComplete: boolean; clinicianProfileComplete: boolean; requiredCredentialsSubmitted: boolean; requiredCredentialsVerified: boolean; mandatoryCredentialsUnexpired: boolean; requiredRelationshipsComplete: boolean; pricingSetupRequired: boolean; pricingSetupComplete: boolean; availabilitySetupRequired: boolean; availabilitySetupComplete: boolean; credentialReady: boolean; blockers: Blocker[]; readyForActivation: boolean; evaluatedAt: string };
type Onboarding = { organizationId: string; practitionerId: string; clinicianType: string; status: string; jurisdiction: string; version: number; ownerSubject: string };
type Decision = { permission: string; allowed: boolean };
const clinicianRoles = ["CONSULTANT", "ASSOCIATE_DOCTOR"];
const practiceRoles = ["ORGANIZATION_OWNER", "PRACTICE_MANAGER", "CONSULTANT_ASSISTANT"];

export function ProviderOrganizationDetail({ locale, organizationId }: { locale: Locale; organizationId: string }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "clinical" | "practice" | "onboarding">("overview");
  const [inviting, setInviting] = useState<string | null>(null);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [inviteRole, setInviteRole] = useState("CONSULTANT"); const [reason, setReason] = useState("");
  const [readiness, setReadiness] = useState<Record<string, Readiness | "error">>({});
  const [onboarding, setOnboarding] = useState<Record<string, Onboarding | "error">>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown, headers?: Record<string, string>): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/providers/" + organizationId + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "REAUTHENTICATION_REQUIRED") { await signIn(true); throw new Error(t.denied); }
      throw new Error(response.status === 403 ? t.denied : response.status === 404 ? t.error : t.error);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : (undefined as T);
  }, [user, t, signIn, organizationId]);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const decisions = await apiFetchAs(user.access_token, "/admin/access/me").then((r) => (r.ok ? r.json() : []));
      setCan(decisions);
      if ((decisions as Decision[]).some((d) => d.permission === "provider.view" && d.allowed)) {
        setDetail(await api<ProviderDetail>(""));
      }
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setLoading(false); }
  }, [api, user, t.error]);
  useEffect(() => { void refresh(); }, [refresh]);

  const ensureReadiness = useCallback((practitionerId: string) => {
    if (readiness[practitionerId] || onboarding[practitionerId]) return;
    void (async () => {
      try {
        const [o, r] = await Promise.all([
          api<Onboarding>(`/clinicians/${practitionerId}/onboarding`),
          api<Readiness>(`/clinicians/${practitionerId}/readiness`),
        ]);
        setOnboarding((s) => ({ ...s, [practitionerId]: o }));
        setReadiness((s) => ({ ...s, [practitionerId]: r }));
      } catch {
        setOnboarding((s) => ({ ...s, [practitionerId]: "error" }));
        setReadiness((s) => ({ ...s, [practitionerId]: "error" }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // The guided onboarding step needs every clinician's real backend readiness, not just the one being expanded.
  useEffect(() => {
    if (!detail) return;
    for (const m of detail.members) if (m.kind === "CLINICIAN" && m.practitionerId) ensureReadiness(m.practitionerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const loadReadiness = (practitionerId: string) => {
    setExpanded(expanded === practitionerId ? null : practitionerId);
    ensureReadiness(practitionerId);
  };

  const [activating, setActivating] = useState(false);
  const activateProvider = async () => {
    if (!detail) return;
    setBusy(true); setError("");
    try {
      await api("/activate?version=" + detail.organization.version, "POST", undefined, { "Idempotency-Key": crypto.randomUUID() });
      setActivating(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await api("/members/invite", "POST", { name, email, role: inviteRole, locale, reason });
      setInviting(null); setName(""); setEmail(""); setReason("");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const setMemberActive = async (m: MemberView, active: boolean) => {
    setBusy(true); setError("");
    try {
      await api(`/members/${encodeURIComponent(m.subject)}/${active ? "activate" : "deactivate"}?revision=${m.revision}`, "POST", { reason: active ? "Activated from control center" : "Deactivated from control center" });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const checklistRows = (r: Readiness) => Object.entries(t.checklist)
    .filter(([key]) => key !== "pricingSetupComplete" || r.pricingSetupRequired)
    .filter(([key]) => key !== "availabilitySetupComplete" || r.availabilitySetupRequired)
    .map(([key, label]) => ({ key, label, ok: Boolean((r as unknown as Record<string, boolean>)[key]) }));

  const memberRow = (m: MemberView) => (
    <li key={m.subject} className="cc-card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
        <div>
          <strong><bdi>{m.subject}</bdi></strong>
          <p className="cc-meta">{m.roles.map((r) => roleLabel(r, locale)).join(" · ")}</p>
          <p className="cc-meta">{memberStatusLabel(m.status, locale)} · {invitationLabel(m.invitationStatus, locale)}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {m.status !== "ACTIVE" && allowed("provider.member.invite") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void setMemberActive(m, true)}>{t.activate}</button>}
          {m.status === "ACTIVE" && allowed("provider.member.deactivate") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void setMemberActive(m, false)}>{t.deactivate}</button>}
          {m.practitionerId && <button type="button" className="cc-secondary" disabled={busy} onClick={() => loadReadiness(m.practitionerId as string)}><ChevronDown size={16} aria-hidden />{t.readiness}</button>}
        </div>
      </div>
      {m.practitionerId && expanded === m.practitionerId && (
        <div style={{ marginTop: 12, borderTop: "1px solid #d7e1dc", paddingTop: 12 }}>
          {onboarding[m.practitionerId] === "error" || readiness[m.practitionerId] === "error" ? <p role="alert" className="cc-message">{t.error}</p> :
            !onboarding[m.practitionerId] || !readiness[m.practitionerId] ? <p role="status">{t.loading}</p> : (
              <>
                {(() => { const o = onboarding[m.practitionerId] as Onboarding; return <p className="cc-meta">{t.clinicianType}: {o.clinicianType} · {t.owner}: <bdi>{o.ownerSubject}</bdi> · {onboardingStatusLabel(o.status, locale)}</p>; })()}
                {(() => {
                  const r = readiness[m.practitionerId] as Readiness;
                  return (
                    <>
                      <span className={"cc-badge " + (r.readyForActivation ? "cc-ready" : "cc-blocked")}>{r.readyForActivation ? t.readyForActivation : t.notReady}</span>
                      <ul className="cc-checklist">
                        {checklistRows(r).map((row) => (
                          <li key={row.key}><span className={row.ok ? "cc-ok" : "cc-pending"}><Check size={16} aria-hidden /></span> {row.label}</li>
                        ))}
                      </ul>
                      {!!r.blockers.length && <ul className="cc-blockers">{r.blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>}
                    </>
                  );
                })()}
              </>
            )}
        </div>
      )}
    </li>
  );

  const inviteForm = (roles: string[]) => (
    <form className="cc-card" onSubmit={submitInvite} style={{ marginBottom: 16 }} aria-label={t.invite}>
      <label>{t.role}<select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{roleLabel(r, locale)}</option>)}</select></label>
      <label>{t.name}<input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>{t.email}<input required type="email" dir="ltr" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>{t.reason}<input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <div className="cc-toolbar">
        <button type="button" className="cc-secondary" onClick={() => setInviting(null)}>{t.cancel}</button>
        <button disabled={busy || !name || !email || !reason}>{t.save}</button>
      </div>
    </form>
  );

  if (authLoading || (loading && !detail)) return <ControlCenterShell locale={locale} active="providers" crumbs={[{ label: t.breadcrumbHome, href: `/${locale}/portal/control-center` }, { label: t.breadcrumbProviders, href: `/${locale}/portal/control-center/providers` }]} title={t.loading}><p role="status">{t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="providers" crumbs={[{ label: t.breadcrumbHome }]} title={t.title}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;

  const crumbs = [{ label: t.breadcrumbHome, href: `/${locale}/portal/control-center` }, { label: t.breadcrumbProviders, href: `/${locale}/portal/control-center/providers` }, { label: detail?.organization.displayName ?? "" }];
  const clinicians = detail?.members.filter((m) => m.kind === "CLINICIAN") ?? [];
  const staff = detail?.members.filter((m) => m.kind === "PRACTICE_STAFF") ?? [];

  return (
    <ControlCenterShell locale={locale} active="providers" crumbs={crumbs} title={detail?.organization.displayName ?? t.noSelection} intro={detail ? `${orgTypeLabel(detail.organization.type, locale)} · ${detail.organization.countryCode} · ${detail.organization.defaultCurrency}` : undefined}
      actions={<button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.refresh}</button>}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!allowed("provider.view") ? <p>{t.denied}</p> : !detail ? <p className="cc-empty">{t.noSelection}</p> : (
        <>
          <nav className="cc-tabs" aria-label={detail.organization.displayName}>
            {(["overview", "clinical", "practice", "onboarding"] as const).map((key) => (
              <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>
                {key === "overview" ? t.overview : key === "clinical" ? t.clinicalTeam : key === "practice" ? t.practiceTeam : t.onboarding}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <section>
              <span className="cc-badge">{orgStatusLabel(detail.organization.status, locale)}</span>
              <ul className="cc-checklist" style={{ marginTop: 12 }}>
                <li><strong>{locale === "ar" ? "الاسم القانوني" : "Legal name"}:</strong>&nbsp;{detail.organization.legalName}</li>
                <li><strong>{t.type}:</strong>&nbsp;{orgTypeLabel(detail.organization.type, locale)}</li>
                <li><strong>{t.country}:</strong>&nbsp;{detail.organization.countryCode}</li>
                <li><strong>{locale === "ar" ? "المنطقة الزمنية" : "Time zone"}:</strong>&nbsp;<bdi>{detail.organization.timeZone}</bdi></li>
                <li><strong>{t.currency}:</strong>&nbsp;{detail.organization.defaultCurrency}</li>
                <li><strong>{t.legacyMapping}:</strong>&nbsp;{detail.organization.legacyMappingStatus}</li>
                <li><strong>{t.members}:</strong>&nbsp;{detail.members.length} ({clinicians.length} {t.clinicalTeam.toLowerCase()}, {staff.length} {t.practiceTeam.toLowerCase()})</li>
              </ul>
            </section>
          )}

          {tab === "clinical" && (
            <section>
              <div className="cc-toolbar" style={{ marginTop: 0 }}>
                <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/providers/${organizationId}/consultants`}>{t.roleConsultants}</Link>
                <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/providers/${organizationId}/associate-doctors`}>{t.roleAssociateDoctors}</Link>
              </div>
              {allowed("provider.clinician.invite") && (inviting === "clinical" ? inviteForm(clinicianRoles) : <button type="button" onClick={() => { setInviteRole("CONSULTANT"); setInviting("clinical"); }}><Plus size={16} aria-hidden />{t.invite}</button>)}
              {!clinicians.length ? <p className="cc-empty">{t.noMembers}</p> : <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>{clinicians.map(memberRow)}</ul>}
            </section>
          )}

          {tab === "practice" && (
            <section>
              <div className="cc-toolbar" style={{ marginTop: 0 }}>
                <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/providers/${organizationId}/practice-managers`}>{t.rolePracticeManagers}</Link>
                <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/providers/${organizationId}/assistants`}>{t.roleAssistants}</Link>
              </div>
              {allowed("provider.practice_staff.manage") && (inviting === "practice" ? inviteForm(practiceRoles) : <button type="button" onClick={() => { setInviteRole("PRACTICE_MANAGER"); setInviting("practice"); }}><Plus size={16} aria-hidden />{t.invite}</button>)}
              {!staff.length ? <p className="cc-empty">{t.noMembers}</p> : <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>{staff.map(memberRow)}</ul>}
              <h2>{t.relationships}</h2>
              {!detail.relationships.length ? <p className="cc-empty">{t.noRelationships}</p> : (
                <ul className="cc-table">
                  {detail.relationships.map((r) => (
                    <li key={r.id}>
                      <span><bdi>{r.subject}</bdi></span>
                      <span>{relationshipTypeLabel(r.type, locale)}</span>
                      <span><bdi>{r.targetPractitionerId}</bdi></span>
                      <span className="cc-badge">{memberStatusLabel(r.status, locale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "onboarding" && (() => {
            const loadedReadiness = clinicians.map((m) => (m.practitionerId ? readiness[m.practitionerId] : undefined)).filter((r): r is Readiness => !!r && r !== "error");
            const allLoaded = clinicians.length > 0 && loadedReadiness.length === clinicians.filter((m) => m.practitionerId).length;
            const owner = detail.members.find((m) => m.roles.includes("ORGANIZATION_OWNER"));
            const outstandingCredentials = loadedReadiness.filter((r) => !r.requiredCredentialsVerified || !r.mandatoryCredentialsUnexpired).length;
            const providerProfileComplete = loadedReadiness.some((r) => r.providerProfileComplete);
            const operationalOutstanding = loadedReadiness.filter((r) => !r.pricingSetupComplete || (r.availabilitySetupRequired && !r.availabilitySetupComplete)).length;
            const commercialOutstanding = loadedReadiness.filter((r) => r.blockers.some((b) => b.code === "COMMERCIAL_ACCEPTANCE_MISSING")).length;
            const readyClinicians = loadedReadiness.filter((r) => r.readyForActivation).length;
            const orgActive = detail.organization.status === "ACTIVE";

            const step = (key: string, titleKey: keyof typeof t, status: StepStatus, body: React.ReactNode, actions?: React.ReactNode) => (
              <li className="cc-step" key={key}>
                <div className="cc-step-head">
                  <h3>{t[titleKey] as string}</h3>
                  <span className={"cc-badge cc-status-" + status}>{t[stepBadgeKey[status]]}</span>
                </div>
                {body}
                {actions && <div className="cc-step-actions">{actions}</div>}
              </li>
            );

            return (
              <section>
                <ul className="cc-stepper">
                  {step("profile", "stepOrgProfile",
                    !allLoaded ? "inprogress" : providerProfileComplete ? "complete" : "needsaction",
                    <p className="cc-meta">{detail.organization.legalName} · {orgTypeLabel(detail.organization.type, locale)} · {detail.organization.legacyMappingStatus}</p>)}

                  {step("owner", "stepOwner",
                    owner && owner.status === "ACTIVE" ? "complete" : "needsaction",
                    <p className="cc-meta">{owner ? <bdi>{owner.subject}</bdi> : t.noneAssigned}</p>)}

                  {step("clinical", "stepClinicalTeam",
                    clinicians.length ? "complete" : "needsaction",
                    <p className="cc-meta">{clinicians.length}</p>,
                    <button type="button" className="cc-secondary" onClick={() => setTab("clinical")}>{t.goToClinicalTeam}</button>)}

                  {step("practice", "stepPracticeTeam",
                    staff.length ? "complete" : "needsaction",
                    <p className="cc-meta">{staff.length}</p>,
                    <button type="button" className="cc-secondary" onClick={() => setTab("practice")}>{t.goToPracticeTeam}</button>)}

                  {step("credentials", "stepCredentials",
                    !allLoaded ? "inprogress" : outstandingCredentials === 0 ? "verified" : "needsaction",
                    <p className="cc-meta">{allLoaded ? t.nOutstandingCredentials(outstandingCredentials, locale) : t.loading}</p>,
                    outstandingCredentials > 0 && <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/credentials?org=${organizationId}`}>{t.goToCredentialQueue}</Link>)}

                  {step("operational", "stepOperational",
                    !allLoaded ? "inprogress" : operationalOutstanding === 0 ? "complete" : "needsaction",
                    <p className="cc-meta">{t.pricingAvailabilityDeferred}</p>)}

                  {step("commercial", "stepCommercial",
                    !allLoaded ? "inprogress" : commercialOutstanding === 0 ? "complete" : "blocked",
                    <p className="cc-meta">{allLoaded ? (commercialOutstanding === 0 ? t.stepComplete : t.stepBlocked) : t.loading}</p>)}

                  {step("activation", "stepActivation",
                    orgActive ? "complete" : allLoaded && owner?.status === "ACTIVE" && readyClinicians > 0 ? "ready" : "blocked",
                    <p className="cc-meta">{orgStatusLabel(detail.organization.status, locale)}</p>,
                    !orgActive && allowed("provider.activate") && (
                      activating ? (
                        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span>{t.activateProviderConfirm}</span>
                          <button type="button" className="cc-secondary" onClick={() => setActivating(false)}>{t.cancel}</button>
                          <button type="button" disabled={busy} onClick={() => void activateProvider()}>{t.save}</button>
                        </span>
                      ) : <button type="button" onClick={() => setActivating(true)}>{t.activateProvider}</button>
                    ))}
                </ul>
              </section>
            );
          })()}
        </>
      )}
    </ControlCenterShell>
  );
}

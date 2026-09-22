"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { FocusTrapDialog } from "./FocusTrapDialog";
import { ccCopy, invitationLabel, memberStatusLabel, onboardingStatusLabel, roleLabel } from "./control-center-copy";

type OrganizationView = { id: string; displayName: string; type: string; status: string; countryCode: string; timeZone: string; defaultCurrency: string; legacyMappingStatus: string; version: number };
type MemberView = { subject: string; kind: "CLINICIAN" | "PRACTICE_STAFF"; practitionerId: string | null; status: string; effectiveFrom: string; effectiveTo: string | null; invitationStatus: string; revision: number; roles: string[] };
type RelationshipView = { id: string; subject: string; type: string; targetPractitionerId: string; status: string; revision: number };
type ProviderDetail = { organization: OrganizationView; members: MemberView[]; relationships: RelationshipView[] };
type Blocker = { code: string; message: string };
type Readiness = { identityProvisioned: boolean; organizationMembershipActive: boolean; providerProfileComplete: boolean; clinicianProfileComplete: boolean; requiredCredentialsSubmitted: boolean; requiredCredentialsVerified: boolean; mandatoryCredentialsUnexpired: boolean; requiredRelationshipsComplete: boolean; pricingSetupRequired: boolean; pricingSetupComplete: boolean; availabilitySetupRequired: boolean; availabilitySetupComplete: boolean; credentialReady: boolean; blockers: Blocker[]; readyForActivation: boolean; evaluatedAt: string };
type Onboarding = { organizationId: string; practitionerId: string; clinicianType: string; status: string; jurisdiction: string; version: number; ownerSubject: string };
type Decision = { permission: string; allowed: boolean };

export type ManagedRole = "CONSULTANT" | "ASSOCIATE_DOCTOR" | "PRACTICE_MANAGER" | "CONSULTANT_ASSISTANT";

const roleConfig: Record<ManagedRole, { titleKey: "roleConsultants" | "roleAssociateDoctors" | "rolePracticeManagers" | "roleAssistants"; kind: "CLINICIAN" | "PRACTICE_STAFF"; invitePermission: string }> = {
  CONSULTANT: { titleKey: "roleConsultants", kind: "CLINICIAN", invitePermission: "provider.clinician.invite" },
  ASSOCIATE_DOCTOR: { titleKey: "roleAssociateDoctors", kind: "CLINICIAN", invitePermission: "provider.clinician.invite" },
  PRACTICE_MANAGER: { titleKey: "rolePracticeManagers", kind: "PRACTICE_STAFF", invitePermission: "provider.practice_staff.manage" },
  CONSULTANT_ASSISTANT: { titleKey: "roleAssistants", kind: "PRACTICE_STAFF", invitePermission: "provider.practice_staff.manage" },
};

/** Relationship semantics: the source role, the fact type, and the target role each relationship connects — exactly the three registered types the backend accepts. */
const relationshipByRole: Record<ManagedRole, { asSource?: "MANAGES" | "ASSISTS" | "SUPERVISES"; asTarget?: "SUPERVISES" | "MANAGES" | "ASSISTS" } > = {
  CONSULTANT: { asTarget: undefined },
  ASSOCIATE_DOCTOR: { asTarget: "SUPERVISES" },
  PRACTICE_MANAGER: { asSource: "MANAGES" },
  CONSULTANT_ASSISTANT: { asSource: "ASSISTS" },
};

export function RoleManagement({ locale, organizationId, role }: { locale: Locale; organizationId: string; role: ManagedRole }) {
  const t = ccCopy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const config = roleConfig[role];
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [can, setCan] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readiness, setReadiness] = useState<Record<string, Readiness | "error">>({});
  const [onboarding, setOnboarding] = useState<Record<string, Onboarding | "error">>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [reason, setReason] = useState("");
  const [assigning, setAssigning] = useState<MemberView | null>(null);
  const [assignTarget, setAssignTarget] = useState("");
  const [assignReason, setAssignReason] = useState("");

  const allowed = (key: string) => can.some((d) => d.permission === key && d.allowed);

  const api = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error(t.denied);
    const response = await apiFetchAs(user.access_token, "/admin/providers/" + organizationId + path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.code === "REAUTHENTICATION_REQUIRED") { await signIn(true); throw new Error(t.denied); }
      throw new Error(data.message || t.error);
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

  const members = (detail?.members ?? []).filter((m) => m.roles.includes(role));
  const consultants = (detail?.members ?? []).filter((m) => m.roles.includes("CONSULTANT"));

  const loadReadiness = (practitionerId: string) => {
    setExpanded(expanded === practitionerId ? null : practitionerId);
    if (readiness[practitionerId] || onboarding[practitionerId]) return;
    void (async () => {
      try {
        const [o, r] = await Promise.all([api<Onboarding>(`/clinicians/${practitionerId}/onboarding`), api<Readiness>(`/clinicians/${practitionerId}/readiness`)]);
        setOnboarding((s) => ({ ...s, [practitionerId]: o })); setReadiness((s) => ({ ...s, [practitionerId]: r }));
      } catch { setOnboarding((s) => ({ ...s, [practitionerId]: "error" })); setReadiness((s) => ({ ...s, [practitionerId]: "error" })); }
    })();
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api("/members/invite", "POST", { name, email, role, locale, reason }); setInviting(false); setName(""); setEmail(""); setReason(""); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const setMemberActive = async (m: MemberView, active: boolean) => {
    setBusy(true); setError("");
    try { await api(`/members/${encodeURIComponent(m.subject)}/${active ? "activate" : "deactivate"}?revision=${m.revision}`, "POST", { reason: active ? "Activated from control center" : "Deactivated from control center" }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const submitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigning || !assignTarget) return;
    setBusy(true); setError("");
    try {
      const rel = relationshipByRole[role];
      const type = rel.asTarget ?? rel.asSource!;
      const consultant = consultants.find((c) => c.subject === assignTarget);
      const body = rel.asTarget
        ? { subject: assignTarget, type, targetPractitionerId: assigning.practitionerId, effectiveFrom: new Date().toISOString(), reason: assignReason }
        : { subject: assigning.subject, type, targetPractitionerId: consultant?.practitionerId, effectiveFrom: new Date().toISOString(), reason: assignReason };
      await api("/relationships", "POST", body);
      setAssigning(null); setAssignTarget(""); setAssignReason(""); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t.error); } finally { setBusy(false); }
  };

  const relationshipsFor = (m: MemberView) => {
    const rel = relationshipByRole[role];
    if (!detail) return [];
    if (rel.asTarget) return detail.relationships.filter((r) => r.targetPractitionerId === m.practitionerId && r.type === rel.asTarget && r.status !== "REVOKED");
    if (rel.asSource) return detail.relationships.filter((r) => r.subject === m.subject && r.type === rel.asSource && r.status !== "REVOKED");
    // CONSULTANT: show everything pointing at them
    return detail.relationships.filter((r) => (r.targetPractitionerId === m.practitionerId || r.subject === m.subject) && r.status !== "REVOKED");
  };

  const consultantName = (practitionerId: string) => consultants.find((c) => c.practitionerId === practitionerId)?.subject ?? practitionerId;

  const checklistRows = (r: Readiness) => Object.entries(t.checklist)
    .filter(([key]) => key !== "pricingSetupComplete" || r.pricingSetupRequired)
    .filter(([key]) => key !== "availabilitySetupComplete" || r.availabilitySetupRequired)
    .map(([key, label]) => ({ key, label, ok: Boolean((r as unknown as Record<string, boolean>)[key]) }));

  if (authLoading || (loading && !detail)) return <ControlCenterShell locale={locale} active="providers" crumbs={[{ label: t.breadcrumbHome, href: `/${locale}/portal/control-center` }]} title={t.loading}><p role="status">{t.loading}</p></ControlCenterShell>;
  if (!user) return <ControlCenterShell locale={locale} active="providers" crumbs={[{ label: t.breadcrumbHome }]} title={t[config.titleKey]}><button onClick={() => void signIn()}>{t.signin}</button></ControlCenterShell>;

  const crumbs = [
    { label: t.breadcrumbHome, href: `/${locale}/portal/control-center` },
    { label: t.breadcrumbProviders, href: `/${locale}/portal/control-center/providers` },
    { label: detail?.organization.displayName ?? "", href: `/${locale}/portal/control-center/providers/${organizationId}` },
    { label: t[config.titleKey] },
  ];

  return (
    <ControlCenterShell locale={locale} active="providers" crumbs={crumbs} title={t[config.titleKey]}
      actions={<button type="button" className="cc-secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} aria-hidden />{t.refresh}</button>}>
      {error && <p role="alert" className="cc-message">{error}</p>}
      {!allowed("provider.view") ? <p>{t.denied}</p> : !detail ? <p className="cc-empty">{t.noSelection}</p> : (
        <>
          {allowed(config.invitePermission) && (inviting ? (
            <form className="cc-card" onSubmit={submitInvite} style={{ marginBottom: 16 }} aria-label={t.invite}>
              <label>{t.name}<input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label>{t.email}<input required type="email" dir="ltr" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <label>{t.reason}<input required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              <div className="cc-toolbar">
                <button type="button" className="cc-secondary" onClick={() => setInviting(false)}>{t.cancel}</button>
                <button disabled={busy || !name || !email || !reason}>{t.save}</button>
              </div>
            </form>
          ) : <button type="button" onClick={() => setInviting(true)}><Plus size={16} aria-hidden />{t.invite}</button>)}

          {!members.length ? <p className="cc-empty">{t.noMembers}</p> : (
            <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
              {members.map((m) => (
                <li key={m.subject} className="cc-card" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                    <div>
                      <strong><bdi>{m.subject}</bdi></strong>
                      <p className="cc-meta">{m.roles.map((r) => roleLabel(r, locale)).join(" · ")}</p>
                      <p className="cc-meta">{memberStatusLabel(m.status, locale)} · {invitationLabel(m.invitationStatus, locale)}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {m.status !== "ACTIVE" && allowed("provider.member.invite") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void setMemberActive(m, true)}>{t.activate}</button>}
                      {m.status === "ACTIVE" && allowed("provider.member.deactivate") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => void setMemberActive(m, false)}>{t.deactivate}</button>}
                      {m.practitionerId && config.kind === "CLINICIAN" && <button type="button" className="cc-secondary" disabled={busy} onClick={() => loadReadiness(m.practitionerId as string)}><ChevronDown size={16} aria-hidden />{t.readiness}</button>}
                      {role !== "CONSULTANT" && allowed("provider.relationship.manage") && <button type="button" className="cc-secondary" disabled={busy} onClick={() => { setAssigning(m); setAssignTarget(""); setAssignReason(""); }}>
                        {role === "ASSOCIATE_DOCTOR" ? t.assignSupervisor : role === "PRACTICE_MANAGER" ? t.assignManaged : t.assignAssisted}
                      </button>}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    {role === "ASSOCIATE_DOCTOR" && (
                      <p className="cc-meta">{t.supervisingConsultant}: {relationshipsFor(m).length ? relationshipsFor(m).map((r) => <bdi key={r.id}>{r.subject}</bdi>) : t.noneAssigned}</p>
                    )}
                    {role === "PRACTICE_MANAGER" && (
                      <p className="cc-meta">{t.managedConsultants}: {relationshipsFor(m).length ? relationshipsFor(m).map((r) => <bdi key={r.id} style={{ marginInlineEnd: 8 }}>{consultantName(r.targetPractitionerId)}</bdi>) : t.noneAssigned}</p>
                    )}
                    {role === "CONSULTANT_ASSISTANT" && (
                      <p className="cc-meta">{t.assistsConsultant}: {relationshipsFor(m).length ? relationshipsFor(m).map((r) => <bdi key={r.id}>{consultantName(r.targetPractitionerId)}</bdi>) : t.noneAssigned}</p>
                    )}
                    {role === "CONSULTANT" && (
                      <p className="cc-meta">{t.relationships}: {relationshipsFor(m).length || t.noneAssigned}</p>
                    )}
                    {config.kind === "CLINICIAN" && m.practitionerId && (
                      <div className="cc-step-actions" style={{ marginTop: 6 }}>
                        <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/providers/${organizationId}/clinicians/${m.practitionerId}/pricing`}>{t.pricing}</Link>
                        <Link className="cc-secondary" style={{ display: "inline-flex", minHeight: 38, padding: "6px 12px" }} href={`/${locale}/portal/control-center/providers/${organizationId}/clinicians/${m.practitionerId}/availability`}>{t.availability}</Link>
                      </div>
                    )}
                  </div>

                  {m.practitionerId && expanded === m.practitionerId && (
                    <div style={{ marginTop: 12, borderTop: "1px solid #d7e1dc", paddingTop: 12 }}>
                      {onboarding[m.practitionerId] === "error" || readiness[m.practitionerId] === "error" ? <p role="alert" className="cc-message">{t.error}</p> :
                        !onboarding[m.practitionerId] || !readiness[m.practitionerId] ? <p role="status">{t.loading}</p> : (
                          <>
                            {(() => { const o = onboarding[m.practitionerId] as Onboarding; return <p className="cc-meta">{t.clinicianType}: {o.clinicianType} · {onboardingStatusLabel(o.status, locale)}</p>; })()}
                            {(() => {
                              const r = readiness[m.practitionerId] as Readiness;
                              return (
                                <>
                                  <span className={"cc-badge " + (r.readyForActivation ? "cc-ready" : "cc-blocked")}>{r.readyForActivation ? t.readyForActivation : t.notReady}</span>
                                  <ul className="cc-checklist">{checklistRows(r).map((row) => <li key={row.key}><span className={row.ok ? "cc-ok" : "cc-pending"}><Check size={16} aria-hidden /></span> {row.label}</li>)}</ul>
                                  {!!r.blockers.length && <ul className="cc-blockers">{r.blockers.map((b, i) => <li key={i}>{b.message}</li>)}</ul>}
                                </>
                              );
                            })()}
                          </>
                        )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="cc-meta">{t.relationshipRemovalNote}</p>

          {assigning && (
            <FocusTrapDialog label={role === "ASSOCIATE_DOCTOR" ? t.assignSupervisor : role === "PRACTICE_MANAGER" ? t.assignManaged : t.assignAssisted} onClose={() => setAssigning(null)}>
              <form onSubmit={submitAssignment}>
                <h2>{role === "ASSOCIATE_DOCTOR" ? t.assignSupervisor : role === "PRACTICE_MANAGER" ? t.assignManaged : t.assignAssisted}</h2>
                <p className="cc-meta"><bdi>{assigning.subject}</bdi></p>
                <label>{t.chooseConsultant}
                  <select required value={assignTarget} onChange={(e) => setAssignTarget(e.target.value)}>
                    <option value="">{t.chooseConsultant}</option>
                    {consultants.map((c) => <option key={c.subject} value={c.subject}>{c.subject}</option>)}
                  </select>
                </label>
                <label>{t.reason}<input required maxLength={500} value={assignReason} onChange={(e) => setAssignReason(e.target.value)} /></label>
                <div className="cc-toolbar">
                  <button type="button" className="cc-secondary" onClick={() => setAssigning(null)}>{t.cancel}</button>
                  <button disabled={busy || !assignTarget || !assignReason}>{t.assign}</button>
                </div>
              </form>
            </FocusTrapDialog>
          )}
        </>
      )}
    </ControlCenterShell>
  );
}

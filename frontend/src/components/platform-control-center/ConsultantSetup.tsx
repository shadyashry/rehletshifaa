"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { AdminApi } from "./admin-api";
import { COORDINATION_VIEW, type ControlCenterAccess } from "./control-center-access";
import { ccHref } from "./control-center-nav";
import { ErrorNotice, StatusBadge } from "./cc-ui";
import { blockerInfo, type Tone } from "./admin-labels";
import type { Member, ProviderDetail } from "./provider-directory";
import { ActivationPanel, activationUnavailable, type Onboarding, type Readiness } from "./consultant-setup";
import type { Badge } from "./clinician-model";

export type SetupTab = "overview" | "credentials" | "relationships" | "prices" | "schedule";
export type SectionKey = "account" | "profile" | "submitted" | "review" | "operational" | "activation";
export type SectionState = "complete" | "attention" | "waiting" | "unavailable";
export type SetupAction = { label: string; tab?: SetupTab; anchor?: string; href?: string; activateMembership?: true };
export type SetupSection = { key: SectionKey; title: string; state: SectionState; doneLabel?: string; owner: string; remaining: { label: string; detail?: string }[]; items?: { label: string; value: string; ok: boolean }[]; actions: SetupAction[] };

const t = (locale: Locale, en: string, ar: string) => (locale === "ar" ? ar : en);
export const stateBadge = (state: SectionState, locale: Locale): { label: string; tone: Tone } => ({
  complete: { label: t(locale, "Complete", "مكتمل"), tone: "success" as Tone },
  attention: { label: t(locale, "Needs attention", "يحتاج إجراء"), tone: "warning" as Tone },
  waiting: { label: t(locale, "Waiting", "بالانتظار"), tone: "info" as Tone },
  unavailable: { label: t(locale, "Not available yet", "غير متاح بعد"), tone: "neutral" as Tone },
})[state];

/**
 * Consultant Setup as six sections, each with its status, who is responsible and what remains. Every value comes from
 * the backend readiness (`ProviderCredentialService.computeReadiness`, unchanged) plus the clinician's credential
 * summary; owners follow the seeded role grants (see ux-3-clinicians-setup-status.md §7). Actions are offered only
 * to someone who holds the capability, and never include credential review decisions.
 */
export function buildSetupSections(input: { locale: Locale; readiness: Readiness; onboarding: Onboarding; member: Member | null; detail: ProviderDetail; credentials: Badge | null; credentialStatuses?: Record<string, number>; access: Pick<ControlCenterAccess, "can" | "canAny"> }): SetupSection[] {
  const { locale, readiness: r, onboarding, member, detail, access } = input;
  const orgId = detail.organization.id, pid = onboarding.practitionerId;
  const issues = (codes: string[]) => r.blockers.filter((b) => codes.includes(b.code)).map((b) => { const i = blockerInfo(b.code, b.message, locale); return { label: i.label, detail: i.detail !== i.label && locale !== "ar" ? i.detail : undefined }; });
  const has = (code: string) => r.blockers.some((b) => b.code === code);
  const count = (s: string) => input.credentialStatuses?.[s] ?? 0;

  const accountDone = r.identityProvisioned && r.organizationMembershipActive;
  const account: SetupSection = {
    key: "account", title: t(locale, "Account", "الحساب"), state: accountDone ? "complete" : "attention",
    owner: t(locale, "Provider Operations or the Organization Owner", "عمليات مقدمي الرعاية أو مالك الجهة"),
    remaining: issues(["IDENTITY_NOT_PROVISIONED", "MEMBERSHIP_INACTIVE"]),
    actions: member?.status === "PENDING" && access.can("provider.member.invite") ? [{ label: t(locale, "Activate membership", "تفعيل العضوية"), activateMembership: true }] : [],
  };

  const profileDone = r.clinicianProfileComplete && r.requiredRelationshipsComplete;
  const profile: SetupSection = {
    key: "profile", title: t(locale, "Professional Profile", "الملف المهني"), state: profileDone ? "complete" : "attention",
    owner: t(locale, "Provider Operations", "عمليات مقدمي الرعاية"),
    remaining: issues(["CLINICIAN_PROFILE_INCOMPLETE", "SUPERVISION_REQUIRED"]),
    actions: [
      ...(!r.clinicianProfileComplete && access.can("provider.update") ? [{ label: t(locale, "Complete professional profile", "إكمال الملف المهني"), tab: "overview" as SetupTab, anchor: "profile" }] : []),
      ...(!r.requiredRelationshipsComplete && access.can("provider.relationship.manage") ? [{ label: t(locale, "Assign supervising consultant", "تعيين استشاري مشرف"), tab: "relationships" as SetupTab }] : []),
    ],
  };

  const replacements = [
    ...(count("REJECTED") ? [{ label: t(locale, "A credential was rejected — a new version is needed.", "رُفض اعتماد — تلزم نسخة جديدة.") }] : []),
    ...(count("MORE_INFORMATION_REQUIRED") ? [{ label: t(locale, "A reviewer asked for more information — see the request on the Credentials tab and submit a new version.", "طلب المراجِع مزيدًا من المعلومات — اطّلع على الطلب في تبويب الاعتمادات وأرسل نسخة جديدة.") }] : []),
  ];
  const submittedDone = r.requiredCredentialsSubmitted && !replacements.length;
  const submitted: SetupSection = {
    key: "submitted", title: t(locale, "Credentials Submitted", "تقديم الاعتمادات"), state: submittedDone ? "complete" : "attention", doneLabel: t(locale, "All submitted", "قُدّمت كلها"),
    owner: t(locale, "The clinician or Provider Operations", "الطبيب أو عمليات مقدمي الرعاية"),
    remaining: [...issues(["CREDENTIAL_POLICY_UNCONFIGURED", "CREDENTIAL_MISSING"]), ...replacements],
    actions: !submittedDone && access.can("credential.submit") ? [{ label: t(locale, "Add credentials", "إضافة الاعتمادات"), tab: "credentials" }] : [],
  };

  const reviewDone = r.requiredCredentialsVerified && r.mandatoryCredentialsUnexpired;
  const expired = has("CREDENTIAL_EXPIRED");
  const reviewRemaining = has("CREDENTIAL_SUSPENDED") ? issues(["CREDENTIAL_SUSPENDED"]) : expired ? issues(["CREDENTIAL_EXPIRED"]).map((i) => ({ ...i, label: t(locale, "A credential has expired — a renewal must be submitted and independently reviewed.", "انتهت صلاحية اعتماد — يجب تقديم تجديد ومراجعته مراجعة مستقلة.") }))
    : !r.requiredCredentialsSubmitted ? [{ label: t(locale, "Starts once every required credential is submitted.", "تبدأ بعد تقديم كل الاعتمادات المطلوبة.") }]
    : replacements.length ? [{ label: t(locale, "Waiting for a replacement credential.", "بانتظار اعتماد بديل.") }]
    : !reviewDone ? [{ label: t(locale, "Awaiting independent review.", "بانتظار مراجعة مستقلة."), detail: input.credentials?.detail }] : [];
  const review: SetupSection = {
    key: "review", title: t(locale, "Independent Credential Review", "المراجعة المستقلة للاعتمادات"), state: reviewDone ? "complete" : expired || has("CREDENTIAL_SUSPENDED") ? "attention" : "waiting", doneLabel: t(locale, "All verified", "تم التحقق منها كلها"),
    owner: t(locale, "Credential Review Team", "فريق مراجعة الاعتمادات"), remaining: reviewRemaining,
    // Review decisions are never made here: reviewers open the review in Reviews & Safety; everyone else sees the status.
    actions: reviewDone ? [] : access.can("credential.review") ? [{ label: t(locale, "Open review", "فتح المراجعة"), href: ccHref(locale, `/credentials?org=${orgId}`) }]
      : access.can("credential.view") ? [{ label: t(locale, "View credential status", "عرض حالة الاعتمادات"), tab: "credentials" }] : [],
  };

  const opUnavailable = has("OPERATIONAL_SETUP_UNAVAILABLE"), routingMissing = has("ROUTING_INCOMPLETE");
  const pricesOk = !r.pricingSetupRequired || r.pricingSetupComplete, scheduleOk = !r.availabilitySetupRequired || r.availabilitySetupComplete;
  const managed = detail.relationships.some((x) => x.type === "MANAGES" && x.targetPractitionerId === pid && x.status !== "REVOKED");
  const operational: SetupSection = {
    key: "operational", title: t(locale, "Operational Setup", "الإعداد التشغيلي"), state: pricesOk && scheduleOk && !routingMissing && !opUnavailable ? "complete" : "attention",
    owner: t(locale, "Practice manager (prices, schedule) · Coordination Setup team (routing)", "مدير العيادة (الأسعار والجدول) · فريق إعداد التنسيق (التوجيه)"),
    items: opUnavailable ? undefined : [
      { label: t(locale, "Prices", "الأسعار"), value: pricesOk ? t(locale, "At least one live price", "سعر منشور واحد على الأقل") : t(locale, "No live price yet", "لا يوجد سعر منشور بعد"), ok: pricesOk },
      { label: t(locale, "Schedule", "الجدول"), value: !r.availabilitySetupRequired ? t(locale, "Not required", "غير مطلوب") : scheduleOk ? t(locale, "Weekly schedule set", "الجدول الأسبوعي محدد") : t(locale, "Not configured", "غير مضبوط"), ok: scheduleOk },
      { label: t(locale, "Routing", "التوجيه"), value: routingMissing ? t(locale, "Needs configuration", "يحتاج ضبطًا") : t(locale, "Configured", "مضبوط"), ok: !routingMissing },
    ],
    remaining: [
      ...issues(["OPERATIONAL_SETUP_UNAVAILABLE"]),
      ...(!managed && (!pricesOk || !scheduleOk) ? [{ label: t(locale, "No practice manager manages this clinician yet. Prices and schedule are set by the clinician's practice manager.", "لا يوجد مدير عيادة يدير هذا الطبيب بعد. يضبط مدير العيادة الأسعار والجدول.") }] : []),
    ],
    actions: [
      ...(!pricesOk && access.can("price_list.view") ? [{ label: t(locale, "Open prices", "فتح الأسعار"), tab: "prices" as SetupTab }] : []),
      ...(!scheduleOk && access.can("availability.view") ? [{ label: t(locale, "Set schedule", "ضبط الجدول"), tab: "schedule" as SetupTab }] : []),
      ...(!managed && (!pricesOk || !scheduleOk) && access.can("provider.relationship.manage") ? [{ label: t(locale, "Assign practice manager", "تعيين مدير عيادة"), tab: "relationships" as SetupTab }] : []),
      ...(routingMissing && access.canAny(COORDINATION_VIEW) ? [{ label: t(locale, "Open Coordination Setup", "فتح إعداد التنسيق"), href: ccHref(locale, `/coordination/${orgId}`) }] : []),
    ],
  };

  const active = onboarding.status === "ACTIVE";
  const orgIncomplete = has("PROVIDER_PROFILE_INCOMPLETE");
  const activation: SetupSection = {
    key: "activation", title: t(locale, "Activation", "التفعيل"),
    state: active ? "complete" : activationUnavailable(r) ? "unavailable" : r.readyForActivation && detail.organization.status === "ACTIVE" ? "attention" : "waiting",
    owner: t(locale, "Provider Operations", "عمليات مقدمي الرعاية"),
    remaining: orgIncomplete ? issues(["PROVIDER_PROFILE_INCOMPLETE"]) : [],
    actions: orgIncomplete && access.can("provider.view") ? [{ label: t(locale, "Open organization setup", "فتح إعداد الجهة"), href: ccHref(locale, `/providers/${orgId}?tab=setup`) }] : [],
  };
  return [account, profile, submitted, review, operational, activation];
}

/**
 * Operational readiness in business words — grouped and labelled from the backend readiness (the same sections as the
 * checklist), never recomputed. Credential status is a separate fact shown next to it, and so is case eligibility.
 */
export function ReadinessSummary({ locale, sections, readiness }: { locale: Locale; sections: SetupSection[]; readiness: Readiness }) {
  const ar = locale === "ar";
  const unavailable = activationUnavailable(readiness);
  const rows: { area: string; value: string; ok: boolean }[] = [];
  for (const s of sections) {
    if (s.key === "operational" && s.items) { s.items.forEach((it) => rows.push({ area: it.label, value: it.value, ok: it.ok })); continue; }
    if (s.key === "activation") {
      rows.push({ area: s.title, ok: s.state === "complete", value: s.state === "complete" ? t(locale, "Activated", "مفعّل") : unavailable ? t(locale, "Unavailable in this release", "غير متاح في هذا الإصدار") : readiness.readyForActivation ? t(locale, "Ready — not activated yet", "جاهز — لم يُفعَّل بعد") : t(locale, "Not ready yet", "غير جاهز بعد") });
      continue;
    }
    rows.push({ area: s.title, ok: s.state === "complete", value: s.state === "complete" ? (s.doneLabel ?? stateBadge("complete", locale).label) : s.remaining[0]?.label ?? stateBadge(s.state, locale).label });
  }
  const overall = sections.find((s) => s.key === "activation")?.state === "complete" ? { label: t(locale, "Activated for cases", "مفعّل لاستقبال الحالات"), tone: "success" as Tone }
    : readiness.readyForActivation ? { label: t(locale, "Ready to activate", "جاهز للتفعيل"), tone: "info" as Tone } : { label: t(locale, "Needs attention", "يحتاج إجراء"), tone: "warning" as Tone };
  return (
    <div className="cc-readiness-summary">
      <p><StatusBadge tone={overall.tone}>{overall.label}</StatusBadge></p>
      <ul className="cc-readiness cc-setup-items" aria-label={ar ? "الجاهزية التشغيلية" : "Operational readiness"}>
        {rows.map((r) => <li key={r.area}><span className="cc-setup-item-label">{r.area}</span><span>{r.value}<span className="cc-sr">{r.ok ? (ar ? " — مكتمل" : " — done") : (ar ? " — غير مكتمل" : " — not done")}</span></span></li>)}
      </ul>
    </div>
  );
}

export function ConsultantSetupChecklist({ locale, sections, api, onboarding, readiness, member, organizationId, organizationActive, canActivate, onGo, onChanged }: {
  locale: Locale; sections: SetupSection[]; api: AdminApi; onboarding: Onboarding; readiness: Readiness; member: Member | null; organizationId: string; organizationActive: boolean; canActivate: boolean;
  onGo: (tab: SetupTab, anchor?: string) => void; onChanged: (notice: string) => void;
}) {
  const ar = locale === "ar";
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const done = sections.filter((s) => s.state === "complete").length;
  const current = sections.find((s) => s.state !== "complete");
  const activateMembership = async () => {
    if (!member) return; setBusy(true); setError(null);
    try { await api(`/admin/providers/${organizationId}/members/${encodeURIComponent(member.subject)}/activate?revision=${member.revision}`, { method: "POST", body: { reason: ar ? "تفعيل العضوية أثناء إعداد الاستشاري" : "Membership activated during consultant setup" } }); onChanged(ar ? "أصبحت العضوية نشطة." : "Membership is now active."); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const action = (a: SetupAction, primary: boolean): ReactNode => {
    const cls = primary ? "cc-small" : "cc-secondary cc-small";
    if (a.href) return <Link key={a.label} className={`${primary ? "cc-primary" : "cc-secondary"} cc-small`} href={a.href}>{a.label}</Link>;
    if (a.activateMembership) return <button key={a.label} type="button" className={cls} disabled={busy} onClick={() => void activateMembership()}>{a.label}</button>;
    return <button key={a.label} type="button" className={cls} onClick={() => onGo(a.tab!, a.anchor)}>{a.label}</button>;
  };
  return (
    <div className="cc-setup">
      <div className="cc-setup-summary" role="status">
        <p className="cc-setup-progress"><strong>{ar ? `${done} من ${sections.length} أقسام مكتملة` : `${done} of ${sections.length} sections complete`}</strong></p>
        {current && <p className="cc-meta">{ar ? "الآن: " : "Now: "}<strong>{current.title}</strong> — {stateBadge(current.state, locale).label} · {ar ? "المسؤول: " : "Responsible: "}{current.owner}</p>}
      </div>
      <ErrorNotice error={error} locale={locale} />
      <ol className="cc-setup-list" aria-label={ar ? "خطوات إعداد الاستشاري" : "Consultant setup sections"}>
        {sections.map((s, i) => {
          const badge = s.state === "complete" && s.doneLabel ? { label: s.doneLabel, tone: "success" as Tone } : stateBadge(s.state, locale);
          return (
            <li key={s.key} className={`cc-setup-section cc-setup-${s.state}${s === current ? " cc-setup-current" : ""}`} aria-current={s === current ? "step" : undefined}>
              <div className="cc-setup-head">
                <h3 id={`setup-${s.key}`}><span className="cc-setup-number" aria-hidden>{i + 1}</span>{s.title}</h3>
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
              </div>
              <p className="cc-meta">{ar ? "المسؤول: " : "Responsible: "}{s.owner}</p>
              {s.items && <ul className="cc-readiness cc-setup-items">{s.items.map((it) => <li key={it.label}><span className="cc-setup-item-label">{it.label}</span><span>{it.value}<span className="cc-sr">{it.ok ? (ar ? " — مكتمل" : " — done") : (ar ? " — غير مكتمل" : " — not done")}</span></span></li>)}</ul>}
              {s.remaining.length > 0 && <ul className="cc-setup-remaining" aria-label={ar ? `المتبقي: ${s.title}` : `What remains: ${s.title}`}>{s.remaining.map((m) => <li key={m.label + (m.detail ?? "")}>{m.label}{m.detail && <span className="cc-row-sub">{m.detail}</span>}</li>)}</ul>}
              {s.key === "activation" && <ActivationPanel locale={locale} api={api} organizationId={organizationId} onboarding={onboarding} readiness={readiness} organizationActive={organizationActive} canActivate={canActivate} onActivated={() => onChanged(ar ? "تم تفعيل الاستشاري." : "Consultant activated.")} />}
              {s.actions.length > 0 && <div className="cc-form-actions cc-setup-actions">{s.actions.map((a, n) => action(a, s === current && n === 0))}</div>}
              {s.state !== "complete" && !s.actions.length && s.key !== "activation" && <p className="cc-meta">{ar ? "لا يوجد ما يمكنك فعله هنا؛ يتولى ذلك المسؤول المذكور." : "Nothing for you to do here — the responsible team handles it."}</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

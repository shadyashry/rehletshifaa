"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { Locale } from "@/lib/i18n";
import { ControlCenterShell } from "./ControlCenterShell";
import { useControlCenterAccess } from "./control-center-access";
import { useAdminApi } from "./admin-api";
import { ccHref } from "./control-center-nav";
import { ActionMenu, EmptyState, ErrorNotice, StatusBadge, SuccessNotice } from "./cc-ui";
import { accountStatusLabel, approvalStatusLabel, careAreaLabel, clinicianStatusLabel, personRoleLabel } from "./admin-labels";
import { CLINICIAN_ROLES, personName, useProviderDirectory } from "./provider-directory";
import { consultantHref, setupHref } from "./ConsultantOnboardingWizard";

export type DirectConsultant = { id: string; displayName?: string; specialty?: string; subspecialty?: string; careCategory?: string; credentialingStatus?: string; availabilityStatus?: string; email?: string; accountStatus?: "INVITED" | "ACTIVE" | "DISABLED"; invitedAt?: string };

/**
 * Consultants, answering "who are our consultants and how far along is each one?". Two real sources, shown
 * separately and named for what they are: consultants set up inside provider organizations, and consultants
 * invited directly for the current case workflow (the former Administration console's list).
 */
export function ConsultantDirectory({ locale, initialView }: { locale: Locale; initialView?: "provider" | "direct" }) {
  const ar = locale === "ar";
  const { user, loading: authLoading, signIn } = useAuth();
  const access = useControlCenterAccess();
  const canProvider = access.can("provider.view"), canDirect = access.legacy.admin;
  const [view, setView] = useState<"provider" | "direct">(initialView ?? "provider");
  useEffect(() => { if (!access.loading && view === "provider" && !canProvider && canDirect) setView("direct"); }, [access.loading, canProvider, canDirect, view]);
  const title = ar ? "الأطباء" : "Clinicians";
  const canAdd = access.can("provider.clinician.invite") || access.legacy.canManage;
  const schedules = access.can("availability.view") ? <Link className="cc-secondary" href={ccHref(locale, "/commercial/availability")}>{ar ? "الجداول" : "Schedules"}</Link> : null;
  const actions = canAdd || schedules ? <>{canAdd && <Link className="cc-primary" href={ccHref(locale, "/providers/onboarding/new")}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link>}{schedules}</> : undefined;
  const shell = (body: React.ReactNode) => <ControlCenterShell locale={locale} active="consultants" title={title} intro={ar ? "الاستشاريون والأطباء المشاركون، ومدى تقدم إعداد كل منهم." : "Consultants and associate doctors, and how far each one's setup has progressed."} actions={actions}>{body}</ControlCenterShell>;
  if (authLoading || access.loading) return shell(<p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>);
  if (!user) return shell(<button onClick={() => void signIn()}>{ar ? "تسجيل الدخول الآمن" : "Sign in securely"}</button>);
  if (!canProvider && !canDirect) return shell(<EmptyState title={ar ? "ليس لديك وصول إلى الأطباء" : "You don't have access to clinicians"} />);
  return shell(
    <>
      {canProvider && canDirect && (
        <div className="cc-segmented" role="group" aria-label={ar ? "مصدر الاستشاريين" : "Consultant source"}>
          <button type="button" aria-pressed={view === "provider"} onClick={() => setView("provider")}>{ar ? "ضمن المؤسسات" : "In provider organizations"}</button>
          <button type="button" aria-pressed={view === "direct"} onClick={() => setView("direct")}>{ar ? "مباشرون (سير الحالات الحالي)" : "Direct (current case workflow)"}</button>
        </div>
      )}
      {view === "provider" && canProvider ? <ProviderConsultants locale={locale} canAdd={access.can("provider.clinician.invite")} /> : <DirectConsultants locale={locale} canManage={access.legacy.systemAdmin} canAdd={access.legacy.canManage} />}
    </>
  );
}

function ProviderConsultants({ locale, canAdd }: { locale: Locale; canAdd: boolean }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const directory = useProviderDirectory(true);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [query, setQuery] = useState(""); const [org, setOrg] = useState(""); const [stage, setStage] = useState<"" | "setup" | "active">("");
  const clinicians = useMemo(() => directory.people.filter((p) => p.practitionerId && p.roles.some((r) => CLINICIAN_ROLES.includes(r))), [directory.people]);
  useEffect(() => {
    let live = true;
    void Promise.all(clinicians.map((c) => api<{ status: string }>(`/admin/providers/${c.organization.id}/clinicians/${c.practitionerId}/onboarding`).then((o) => [c.practitionerId!, o.status] as const).catch(() => [c.practitionerId!, ""] as const)))
      .then((rows) => { if (live) setStatuses(Object.fromEntries(rows)); });
    return () => { live = false; };
  }, [clinicians, api]);
  if (directory.loading) return <p role="status">{ar ? "جارٍ تحميل الاستشاريين…" : "Loading consultants…"}</p>;
  if (directory.error) return <ErrorNotice error={directory.error} locale={locale} action="load" onRetry={() => void directory.reload()} />;
  if (!clinicians.length) return <EmptyState title={ar ? "لا يوجد استشاريون بعد" : "No consultants yet"} body={ar ? "أضف أول استشاري لبدء إعداده." : "Add your first consultant to begin onboarding."} action={canAdd ? <Link className="cc-primary" href={ccHref(locale, "/providers/onboarding/new")}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link> : undefined} />;
  const orgs = directory.details.map((d) => d.organization);
  const rows = clinicians.filter((c) => (!org || c.organization.id === org)
    && (!stage || (stage === "active" ? statuses[c.practitionerId!] === "ACTIVE" : statuses[c.practitionerId!] !== "ACTIVE"))
    && `${c.displayName ?? ""} ${c.organization.displayName}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <div className="cc-filterbar">
        <label>{ar ? "بحث" : "Search"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "الاسم أو المؤسسة" : "Name or organization"} /></label>
        {orgs.length > 1 && <label>{ar ? "المؤسسة" : "Organization"}<select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">{ar ? "كل المؤسسات" : "All organizations"}</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}</select></label>}
        <label>{ar ? "المرحلة" : "Stage"}<select value={stage} onChange={(e) => setStage(e.target.value as typeof stage)}><option value="">{ar ? "الكل" : "All"}</option><option value="setup">{ar ? "قيد الإعداد" : "Setup in progress"}</option><option value="active">{ar ? "نشط" : "Active"}</option></select></label>
      </div>
      {!rows.length ? <EmptyState title={ar ? "لا توجد نتائج مطابقة" : "No consultants match these filters"} /> : (
        <ul className="cc-list" aria-label={ar ? "الاستشاريون" : "Consultants"}>
          <li className="cc-list-head" aria-hidden><span>{ar ? "الاستشاري" : "Consultant"}</span><span>{ar ? "المؤسسة" : "Organization"}</span><span>{ar ? "الحالة" : "Status"}</span><span /></li>
          {rows.map((c) => {
            const s = statuses[c.practitionerId!]; const label = s ? clinicianStatusLabel(s, locale) : null;
            return (
              <li key={c.organization.id + c.subject}>
                <span><Link className="cc-row-title" href={consultantHref(locale, c.organization.id, c.practitionerId!)}>{personName(c, locale)}</Link><span className="cc-row-sub">{c.roles.filter((r) => CLINICIAN_ROLES.includes(r)).map((r) => personRoleLabel(r, locale)).join(" · ")}</span></span>
                <span>{c.organization.displayName}</span>
                <span>{label ? <StatusBadge tone={label.tone}>{label.label}</StatusBadge> : <span className="cc-meta">{ar ? "جارٍ التحقق…" : "Checking…"}</span>}</span>
                <span className="cc-row-actions">
                  {s && s !== "ACTIVE" && <Link className="cc-secondary cc-small" href={setupHref(locale, c.organization.id, c.practitionerId!)}>{ar ? "متابعة الإعداد" : "Continue setup"}</Link>}
                  <ActionMenu label={(ar ? "إجراءات: " : "Actions: ") + personName(c, locale)} actions={[
                    { label: ar ? "فتح" : "Open", onSelect: () => undefined, href: consultantHref(locale, c.organization.id, c.practitionerId!) },
                    { label: ar ? "الاعتمادات" : "Credentials", onSelect: () => undefined, href: consultantHref(locale, c.organization.id, c.practitionerId!, "credentials") },
                    { label: ar ? "الأسعار" : "Pricing", onSelect: () => undefined, href: consultantHref(locale, c.organization.id, c.practitionerId!, "pricing") },
                    { label: ar ? "الجدول" : "Schedule", onSelect: () => undefined, href: consultantHref(locale, c.organization.id, c.practitionerId!, "availability") },
                  ]} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export function DirectConsultants({ locale, canManage, canAdd }: { locale: Locale; canManage: boolean; canAdd: boolean }) {
  const ar = locale === "ar";
  const api = useAdminApi();
  const [items, setItems] = useState<DirectConsultant[] | null>(null);
  const [error, setError] = useState<unknown>(null); const [actionError, setActionError] = useState<unknown>(null); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState("");
  const [query, setQuery] = useState(""); const [stage, setStage] = useState("");
  const load = useCallback(async () => { setError(null); try { setItems(await api<DirectConsultant[]>("/admin/practitioners")); } catch (e) { setError(e); setItems([]); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const act = async (item: DirectConsultant, action: "resend-invite" | "disable" | "enable") => {
    if (action === "disable" && !window.confirm(ar ? `تعطيل وصول ${item.displayName}؟ لن يتمكن من تسجيل الدخول.` : `Disable ${item.displayName}'s access? They will no longer be able to sign in.`)) return;
    setBusy(item.id); setActionError(null); setNotice("");
    try { await api(`/admin/practitioners/${item.id}/${action}${action === "resend-invite" ? `?locale=${locale}` : ""}`, { method: "POST" }); setNotice(action === "resend-invite" ? (ar ? "أُعيد إرسال الدعوة." : "Invitation sent again.") : (ar ? "تم تحديث الوصول." : "Access updated.")); await load(); }
    catch (e) { setActionError(e); } finally { setBusy(""); }
  };
  if (items === null) return <p role="status">{ar ? "جارٍ التحميل…" : "Loading…"}</p>;
  if (error) return <ErrorNotice error={error} locale={locale} action="load" onRetry={() => void load()} />;
  if (!items.length) return <EmptyState title={ar ? "لا يوجد استشاريون مباشرون" : "No direct consultants yet"} body={ar ? "ادعُ استشاريًا ليُعتمد لسير عمل الحالات الحالي." : "Invite a consultant to approve them for the current case workflow."} action={canAdd ? <Link className="cc-primary" href={ccHref(locale, "/providers/onboarding/new")}><Plus size={16} aria-hidden />{ar ? "إضافة استشاري" : "Add consultant"}</Link> : undefined} />;
  const rows = items.filter((i) => (!stage || i.credentialingStatus === stage) && `${i.displayName ?? ""} ${i.specialty ?? ""} ${i.email ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const href = (i: DirectConsultant, tab?: string) => ccHref(locale, `/providers/consultants/direct/${i.id}${tab ? `?tab=${tab}` : ""}`);
  return (
    <>
      <SuccessNotice>{notice || null}</SuccessNotice>
      <ErrorNotice error={actionError} locale={locale} />
      <div className="cc-filterbar">
        <label>{ar ? "بحث" : "Search"}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar ? "الاسم أو التخصص أو البريد" : "Name, speciality or email"} /></label>
        <label>{ar ? "الاعتماد" : "Approval"}<select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">{ar ? "الكل" : "All"}</option>{["UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"].map((s) => <option key={s} value={s}>{approvalStatusLabel(s, locale).label}</option>)}</select></label>
      </div>
      {!rows.length ? <EmptyState title={ar ? "لا توجد نتائج مطابقة" : "No consultants match these filters"} /> : (
        <ul className="cc-list" aria-label={ar ? "الاستشاريون المباشرون" : "Direct consultants"}>
          <li className="cc-list-head" aria-hidden><span>{ar ? "الاستشاري" : "Consultant"}</span><span>{ar ? "الاعتماد للحالات" : "Case approval"}</span><span>{ar ? "الحساب" : "Account"}</span><span /></li>
          {rows.map((i) => {
            const approval = approvalStatusLabel(i.credentialingStatus, locale), account = accountStatusLabel(i.accountStatus, locale);
            return (
              <li key={i.id}>
                <span><Link className="cc-row-title" href={href(i)}>{i.displayName ?? (ar ? "بلا اسم" : "Unnamed")}</Link><span className="cc-row-sub">{[i.specialty, careAreaLabel(i.careCategory, locale)].filter(Boolean).join(" · ")}</span></span>
                <span><StatusBadge tone={approval.tone}>{approval.label}</StatusBadge></span>
                <span><StatusBadge tone={account.tone}>{account.label}</StatusBadge></span>
                <span className="cc-row-actions">
                  {i.credentialingStatus === "UNDER_REVIEW" && <Link className="cc-secondary cc-small" href={href(i, "approval")}>{ar ? "مراجعة" : "Review"}</Link>}
                  <ActionMenu label={(ar ? "إجراءات: " : "Actions: ") + (i.displayName ?? "")} actions={[
                    { label: ar ? "فتح" : "Open", onSelect: () => undefined, href: href(i) },
                    { label: ar ? "قائمة الأسعار" : "Price list", onSelect: () => undefined, href: href(i, "pricing") },
                    ...(canManage && i.accountStatus === "INVITED" ? [{ label: ar ? "إعادة إرسال الدعوة" : "Resend invitation", onSelect: () => void act(i, "resend-invite"), disabled: busy === i.id }] : []),
                    ...(canManage ? [i.accountStatus === "DISABLED" ? { label: ar ? "استعادة الوصول" : "Restore access", onSelect: () => void act(i, "enable"), disabled: busy === i.id } : { label: ar ? "تعطيل الوصول" : "Disable access", onSelect: () => void act(i, "disable"), destructive: true, disabled: busy === i.id }] : []),
                  ]} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

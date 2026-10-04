"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";

type MetricView = { definitionVersion: string; evaluatedAt: string; from: string; to: string; freshnessTarget: string; data: Record<string, unknown> };
type Assignment = { id: string; subject: string; effectiveFrom: string; effectiveTo?: string | null; revision: number };
type Change = { id: string; type: string; subject: string; status: string; requestedBy: string; effectiveFrom: string; effectiveTo?: string | null; expiresAt: string; revision: number };
type Governance = { evaluatedAt: string; currentOwner: string; administrators: Assignment[]; administratorChanges: Change[]; effectiveAdministratorCount: number; belowRecommendedAdministratorCount: boolean; governanceNotificationsConfigured: boolean; failedGovernanceNotifications: number };
type Tab = "overview" | "revenue" | "journeys" | "consultants" | "operations" | "workforce" | "patients" | "risk" | "governance";

const screens: { key: Tab; path: string; en: string; ar: string }[] = [
  { key: "overview", path: "/owner/overview", en: "Executive overview", ar: "النظرة التنفيذية" },
  { key: "revenue", path: "/owner/analytics/revenue", en: "Revenue", ar: "الإيرادات" },
  { key: "journeys", path: "/owner/analytics/journeys", en: "Journeys", ar: "الرحلات" },
  { key: "consultants", path: "/owner/analytics/consultants", en: "Consultants", ar: "الاستشاريون" },
  { key: "operations", path: "/owner/analytics/operations", en: "Operations", ar: "العمليات" },
  { key: "workforce", path: "/owner/analytics/workforce", en: "Workforce", ar: "فريق العمل" },
  { key: "patients", path: "/owner/analytics/patient-experience", en: "Patient experience", ar: "تجربة المريض" },
  { key: "risk", path: "/owner/analytics/risk-compliance", en: "Risk & compliance", ar: "المخاطر والامتثال" },
  { key: "governance", path: "/owner/governance", en: "Governance", ar: "الحوكمة" },
];

const labels: Record<string, [string, string]> = {
  activeCases: ["Active cases", "الحالات النشطة"], activeWorkforce: ["Active workforce", "فريق العمل النشط"],
  verifiedConsultants: ["Verified consultants", "الاستشاريون المعتمدون"], netPaymentsEgp: ["Net payments (EGP)", "صافي المدفوعات (ج.م)"],
  pendingAdministratorChanges: ["Pending administrator changes", "تغييرات المسؤولين المعلّقة"], createdCases: ["Cases created", "الحالات المنشأة"],
  statusTransitions: ["Status transitions", "انتقالات الحالة"], activeAssignments: ["Active assignments", "التعيينات النشطة"],
  overdueOpenTasks: ["Overdue open tasks", "المهام المفتوحة المتأخرة"], activeOperationsAssignments: ["Active operations assignments", "تعيينات العمليات النشطة"],
  effectiveAdministrators: ["Effective administrators", "المسؤولون الفعّالون"], openStaffingRequests: ["Open staffing requests", "طلبات التوظيف المفتوحة"],
  patientDecisions: ["Patient decisions", "قرارات المرضى"], governanceEvents: ["Governance events", "أحداث الحوكمة"],
  deniedEvents: ["Denied events", "الأحداث المرفوضة"], pendingMfaResets: ["Pending MFA resets", "إعادة تعيين التحقق المعلّقة"],
  openRecertifications: ["Open access reviews", "مراجعات الوصول المفتوحة"], eventsByType: ["Payment events", "أحداث الدفع"],
  amountsByCurrency: ["Amounts by currency", "المبالغ حسب العملة"], paymentMethods: ["Payment methods", "وسائل الدفع"],
  casesByStatus: ["Cases by status", "الحالات حسب الحالة"], byCredentialingStatus: ["Credentialing status", "حالة الاعتماد"],
  byAvailability: ["Availability", "التوفر"], tasksByStatus: ["Tasks by status", "المهام حسب الحالة"],
  peopleByLifecycle: ["People by lifecycle", "الأشخاص حسب دورة الحياة"], effectiveRoles: ["Effective roles", "الأدوار الفعّالة"],
  proposalOutcomes: ["Proposal outcomes", "نتائج العروض"],
};

function label(key: string, locale: Locale) { return labels[key]?.[locale === "ar" ? 1 : 0] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()); }
function format(value: unknown, locale: Locale) {
  if (typeof value === "number") return value.toLocaleString(locale);
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${String(item)}`).join(" · ") || "—";
  return "—";
}

export function OwnerWorkspace({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const { user, me, loading, signIn, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<MetricView | Governance | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [decision, setDecision] = useState<{ request: Change; approve: boolean } | null>(null);
  const [reason, setReason] = useState("");
  const [incomingOwner, setIncomingOwner] = useState("");
  const current = useMemo(() => screens.find(item => item.key === tab)!, [tab]);

  const load = useCallback(async () => {
    if (!user || !me?.platformAccountOwner) return;
    setError("");
    try {
      const response = await apiFetchAs(user.access_token, current.path);
      if (!response.ok) throw new Error(response.status === 403 ? (ar ? "هذه المساحة متاحة لمالك المنصة الحالي فقط." : "This workspace is available only to the current Platform Account Owner.") : (ar ? "تعذّر تحميل البيانات." : "The data could not be loaded."));
      setData(await response.json());
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [ar, current.path, me?.platformAccountOwner, user]);
  useEffect(() => { setData(null); void load(); }, [load]);

  async function mutate(path: string, body: unknown) {
    if (!user) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetchAs(user.access_token, path, { method: "POST", body: JSON.stringify(body) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string; code?: string };
        if (response.status === 401) { await signIn(true); return; }
        throw new Error(payload.message ?? payload.code ?? (ar ? "تعذّر إكمال الإجراء." : "The action could not be completed."));
      }
      setNotice(ar ? "تم تسجيل الإجراء." : "The action was recorded."); setDecision(null); setReason(""); setIncomingOwner(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }

  if (loading) return <Shell locale={locale}><p role="status">{ar ? "جارٍ التحقق من الوصول…" : "Checking access…"}</p></Shell>;
  if (!user) return <Shell locale={locale}><button className="btn-primary" onClick={() => void signIn()}>{ar ? "تسجيل الدخول" : "Sign in"}</button></Shell>;
  if (!me?.platformAccountOwner) return <Shell locale={locale}><p role="alert">{ar ? "هذه المساحة متاحة لمالك المنصة الحالي فقط." : "This workspace is available only to the current Platform Account Owner."}</p></Shell>;

  const governance = tab === "governance" ? data as Governance | null : null;
  const metric = tab !== "governance" ? data as MetricView | null : null;
  return <Shell locale={locale}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-600">{ar ? "عرض تنفيذي للقراءة فقط. لا تمنح الملكية صلاحيات تشغيلية أو سريرية." : "Read-only executive insight. Ownership grants no operational or clinical authority."}</p>
      <div className="flex gap-2"><Link className="btn-secondary" href={`/${locale}/portal`}>{ar ? "مساحات العمل" : "Workspaces"}</Link><button className="btn-secondary" onClick={() => void signOut()}>{ar ? "تسجيل الخروج" : "Sign out"}</button></div>
    </div>
    <nav className="mb-6 flex flex-wrap gap-2" aria-label={ar ? "لوحات المالك" : "Owner dashboards"}>{screens.map(item => <button type="button" key={item.key} className={tab === item.key ? "btn-primary" : "btn-secondary"} onClick={() => setTab(item.key)}>{ar ? item.ar : item.en}</button>)}</nav>
    {notice && <p role="status" className="mb-4 rounded-xl bg-brand-50 p-4 text-brand-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-xl bg-alert-50 p-4 text-alert-800">{error} <button className="font-semibold underline" onClick={() => void load()}>{ar ? "إعادة المحاولة" : "Retry"}</button></p>}
    {!data && !error && <p role="status">{ar ? "جارٍ تحميل اللوحة…" : "Loading dashboard…"}</p>}
    {metric && <>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-500"><span>{ar ? "حتى" : "As of"} {new Date(metric.evaluatedAt).toLocaleString(locale)}</span><span>{ar ? "الفترة" : "Period"}: {new Date(metric.from).toLocaleDateString(locale)} – {new Date(metric.to).toLocaleDateString(locale)}</span><span>{ar ? "حداثة البيانات" : "Freshness"}: {metric.freshnessTarget}</span><span>{ar ? "تعريف" : "Definition"}: {metric.definitionVersion}</span></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(metric.data).map(([key, value]) => <article className="card p-5" key={key}><h2 className="text-sm font-semibold text-ink-600">{label(key, locale)}</h2><p className="mt-3 break-words text-2xl font-bold text-brand-900">{format(value, locale)}</p></article>)}</div>
    </>}
    {governance && <GovernancePanel locale={locale} value={governance} busy={busy} decision={decision} reason={reason} incomingOwner={incomingOwner} onDecision={setDecision} onReason={setReason} onIncomingOwner={setIncomingOwner} onCancel={() => { setDecision(null); setReason(""); }} onDecide={() => decision && void mutate(`/admin/platform-access/administrator-changes/${decision.request.id}/${decision.approve ? "approve" : "reject"}`, { revision: decision.request.revision, reason })} onTransfer={() => void mutate("/admin/platform-access/owner-transfers", { incomingOwnerSubject: incomingOwner, reason })} />}
  </Shell>;
}

function GovernancePanel({ locale, value, busy, decision, reason, incomingOwner, onDecision, onReason, onIncomingOwner, onCancel, onDecide, onTransfer }: { locale: Locale; value: Governance; busy: boolean; decision: { request: Change; approve: boolean } | null; reason: string; incomingOwner: string; onDecision: (value: { request: Change; approve: boolean } | null) => void; onReason: (value: string) => void; onIncomingOwner: (value: string) => void; onCancel: () => void; onDecide: () => void; onTransfer: () => void }) {
  const ar = locale === "ar"; const pending = value.administratorChanges.filter(change => change.status === "PENDING");
  return <div className="grid gap-5 xl:grid-cols-2">
    {value.belowRecommendedAdministratorCount && <p role="alert" className="rounded-xl bg-alert-50 p-4 text-alert-800 xl:col-span-2">{ar ? "عدد مسؤولي النظام الفعّالين أقل من العدد التشغيلي الموصى به وهو اثنان." : "Effective System Administrators are below the operational target of two."}</p>}
    {(!value.governanceNotificationsConfigured || value.failedGovernanceNotifications > 0) && <p role="alert" className="rounded-xl bg-alert-50 p-4 text-alert-800 xl:col-span-2">{!value.governanceNotificationsConfigured ? (ar ? "وجهات إشعارات الحوكمة غير مهيأة." : "Governance notification destinations are not configured.") : (ar ? `توجد ${value.failedGovernanceNotifications} إشعارات حوكمة متعذرة.` : `${value.failedGovernanceNotifications} governance notification(s) are dead-lettered.`)}</p>}
    <section className="card p-5"><h2 className="title">{ar ? "السلطة الحالية" : "Current authority"}</h2><p className="mt-3 text-sm"><strong>{ar ? "المالك" : "Owner"}:</strong> <bdi dir="ltr">{value.currentOwner}</bdi></p><p className="mt-2 text-sm"><strong>{ar ? "المسؤولون الفعّالون" : "Effective administrators"}:</strong> {value.effectiveAdministratorCount}</p><ul className="mt-3 space-y-2">{value.administrators.map(item => <li className="rounded-lg bg-mist p-3 text-sm" key={item.id}><bdi dir="ltr">{item.subject}</bdi><span className="block text-xs text-ink-500">{new Date(item.effectiveFrom).toLocaleString(locale)}{item.effectiveTo ? ` → ${new Date(item.effectiveTo).toLocaleString(locale)}` : ""}</span></li>)}</ul></section>
    <section className="card p-5"><h2 className="title">{ar ? "تغييرات المسؤولين المعلّقة" : "Pending administrator changes"}</h2>{!pending.length ? <p className="mt-3 text-sm text-ink-500">{ar ? "لا توجد طلبات معلّقة." : "No pending requests."}</p> : <ul className="mt-3 space-y-3">{pending.map(item => <li className="rounded-lg border border-line p-3" key={item.id}><strong>{item.type}</strong> · <bdi dir="ltr">{item.subject}</bdi><p className="text-xs text-ink-500">{ar ? "طلبه" : "Requested by"} <bdi dir="ltr">{item.requestedBy}</bdi> · {ar ? "ينتهي" : "expires"} {new Date(item.expiresAt).toLocaleString(locale)}</p><div className="mt-2 flex gap-2"><button className="btn-primary" disabled={item.requestedBy === value.currentOwner} onClick={() => onDecision({ request: item, approve: true })}>{ar ? "موافقة" : "Approve"}</button><button className="btn-secondary" disabled={item.requestedBy === value.currentOwner} onClick={() => onDecision({ request: item, approve: false })}>{ar ? "رفض" : "Reject"}</button></div></li>)}</ul>}</section>
    <section className="card p-5 xl:col-span-2"><h2 className="title">{ar ? "نقل ملكية المنصة" : "Transfer platform ownership"}</h2><p className="mt-2 text-sm text-ink-600">{ar ? "يتطلب قبول المالك التالي ثم تحقق مسؤول نظام مستقل. تنتقل صلاحيات المالك فور الإكمال." : "Requires successor acceptance and independent System Administrator verification. Owner authority moves immediately on completion."}</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_auto]"><input dir="ltr" maxLength={255} value={incomingOwner} onChange={e => onIncomingOwner(e.target.value)} placeholder={ar ? "معرّف حساب المالك التالي" : "Successor account subject"}/><input maxLength={1000} value={decision ? "" : reason} onChange={e => onReason(e.target.value)} placeholder={ar ? "سبب النقل" : "Transfer reason"}/><button className="btn-primary" disabled={busy || !incomingOwner.trim() || !reason.trim()} onClick={onTransfer}>{ar ? "بدء النقل" : "Start transfer"}</button></div></section>
    {decision && <section role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form className="card w-full max-w-lg p-6" onSubmit={event => { event.preventDefault(); onDecide(); }}><h2 className="title">{decision.approve ? (ar ? "الموافقة على التغيير" : "Approve administrator change") : (ar ? "رفض التغيير" : "Reject administrator change")}</h2><p className="mt-2 text-sm"><bdi dir="ltr">{decision.request.subject}</bdi></p><label className="mt-4 block text-sm font-semibold">{ar ? "السبب" : "Reason"}<textarea required maxLength={1000} className="mt-1 w-full" value={reason} onChange={e => onReason(e.target.value)} /></label><div className="mt-4 flex gap-2"><button className="btn-primary" disabled={busy || !reason.trim()}>{ar ? "تأكيد" : "Confirm"}</button><button type="button" className="btn-secondary" onClick={onCancel}>{ar ? "إلغاء" : "Cancel"}</button></div></form></section>}
  </div>;
}

function Shell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const ar = locale === "ar";
  return <main className="min-h-screen bg-mist py-8"><div className="container-site"><p className="eyebrow">{ar ? "مالك حساب المنصة" : "Platform Account Owner"}</p><h1 className="headline mt-2">{ar ? "لوحة القيادة التنفيذية" : "Executive workspace"}</h1><div className="mt-6">{children}</div></div></main>;
}

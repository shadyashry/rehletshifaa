"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, History, ShieldCheck, Stethoscope, Users, Wallet } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetchAs } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import {
  SERVICE_KINDS, formatEgp, useVirtualClinics, virtualClinicHref,
  type Clinic, type ClinicAuditEntry, type ClinicPermission, type ClinicService, type ServiceChange,
} from "./virtual-clinic-model";

type Section = "overview" | "services" | "schedule" | "team" | "history";
export type ClinicCall = <T = unknown>(path: string, method?: string, body?: unknown) => Promise<T>;

const copy = {
  en: {
    title: "Virtual Clinic", loading: "Loading your virtual clinic…", signIn: "Sign in securely", signInLead: "Sign in to open your virtual clinic.",
    none: "There is no virtual clinic for this account.", noneBody: "A virtual clinic belongs to a RehletShifaa consultant. Practice managers see the clinics a consultant has invited them to.",
    failed: "We couldn't load the virtual clinic. Nothing has changed.", retry: "Try again", switchClinic: "Clinic",
    ownerLead: "Your practice inside RehletShifaa: your profile, availability, services, prices and schedule. It is not a physical clinic or hospital.",
    managerLead: "You help run this consultant's practice. You can only do what the consultant has allowed, and you never see patients, cases, medical documents or clinical decisions.",
    sections: { overview: "Overview", services: "Services & prices", schedule: "Schedule", team: "Practice managers", history: "Change history" } as Record<Section, string>,
    professional: "Professional profile", specialty: "Specialty", subspecialty: "Subspecialty", careArea: "Care area", credentials: "Credentials",
    verified: "Verified by RehletShifaa", notVerified: "Not verified", current: "Current", renewal: "Renewal needed", capabilities: "Approved clinical capabilities",
    noCapabilities: "No additional capabilities approved yet. RehletShifaa's credentialing team approves these.", assignable: "Eligible for new case assignments", notAssignable: "Not currently eligible for new cases",
    availability: "Availability for new cases", accepting: "Accepting new cases", notAccepting: "Not accepting new cases", reviewHours: "Expected review time (hours)", save: "Save",
    publicProfile: "Public profile", published: "Published", notPublished: "Nothing published yet.", draft: "Draft waiting for your approval", draftByManager: "Prepared by",
    approvePublish: "Approve & publish", discard: "Discard draft", editProfile: "Edit public profile", headline: "Headline", bio: "About", languages: "Languages", displayName: "Display name",
    saveForApproval: "Save for the consultant's approval", saveDraft: "Save draft", publishNow: "Publish now",
    settings: "Approval settings", requireApproval: "Practice-manager changes to services and prices need my approval before they apply",
    servicesLead: "Only your own professional services. Hospital charges, implants, accommodation, travel packages and third-party services are not listed here. Prices are held in EGP; patients see their own currency on the proposal.",
    noServices: "No services yet.", code: "Code", kind: "Kind", price: "Price", effective: "Effective", expires: "Expires", status: "Status", active: "Active", retired: "Retired", revision: "Revision",
    edit: "Edit", retire: "Retire", activate: "Activate", history: "History", closeHistory: "Close history", pending: "Changes waiting for approval", noPending: "No changes are waiting.",
    approve: "Approve", reject: "Reject", rejectReason: "Reason for rejecting", waiting: "Waiting for the consultant", by: "by",
    addService: "Add a service", editService: "Change service", serviceName: "Service name", description: "Description", included: "Included", excluded: "Not included",
    priceFrom: "Price (EGP)", priceTo: "Upper price for a range (optional)", effectiveFrom: "Effective from", validUntil: "Expires on (optional)",
    submitChange: "Save change", submitForApproval: "Send for approval", cancel: "Cancel",
    approvalStatus: { PLATFORM_MANAGED: "Set by RehletShifaa", CONSULTANT_APPROVED: "Approved by consultant", APPLIED_WITHOUT_APPROVAL: "Applied without approval (clinic setting)" } as Record<string, string>,
    changeType: { CREATE: "New service", UPDATE: "Change", RETIRE: "Retire", ACTIVATE: "Re-activate" } as Record<string, string>,
    changeStatus: { PENDING_APPROVAL: "Waiting for approval", APPLIED: "Applied", REJECTED: "Rejected" } as Record<string, string>,
    kinds: { INITIAL_CASE_REVIEW: "Initial medical-case review", VIDEO_CONSULTATION: "Video consultation", IN_PERSON_CONSULTATION: "In-person consultation", FOLLOW_UP_CONSULTATION: "Follow-up consultation", PROFESSIONAL_FEE: "Consultant professional fee", OTHER_PROFESSIONAL_SERVICE: "Other professional service" } as Record<string, string>,
    scheduleLead: "Consultation slots your team works from. Patients cannot book these slots online yet.", noSlots: "No upcoming consultation slots.",
    addSlot: "Add a consultation slot", startsAt: "Starts", duration: "Duration (minutes)", mode: "Consultation type", video: "Video", inPerson: "In person",
    note: "Administrative note (no clinical information)", addSlotButton: "Add slot", cancelSlot: "Cancel slot", cancelled: "Cancelled", open: "Open",
    teamLead: "Practice managers help with administration only. They never see patients, cases, medical documents, messages or clinical decisions.",
    noManagers: "No practice managers yet.", invite: "Invite a practice manager", name: "Full name", email: "Work email", invitePerson: "Send invitation",
    permissions: { SCHEDULE: "Manage schedule", PROFILE: "Prepare public profile", SERVICES: "Prepare services & prices" } as Record<ClinicPermission, string>,
    savePermissions: "Save permissions", revoke: "Revoke access", reinstate: "Reinstate", revoked: "Revoked", activeManager: "Active",
    historyLead: "Every change made in your virtual clinic, and who made it.", noHistory: "No changes recorded yet.", you: "Consultant", manager: "Practice manager",
  },
  ar: {
    title: "العيادة الافتراضية", loading: "جارٍ تحميل عيادتك الافتراضية…", signIn: "تسجيل الدخول الآمن", signInLead: "سجّل الدخول لفتح عيادتك الافتراضية.",
    none: "لا توجد عيادة افتراضية لهذا الحساب.", noneBody: "العيادة الافتراضية ملك لاستشاري في رحلة الشفاء. يرى مديرو العيادة العيادات التي دعاهم إليها الاستشاري فقط.",
    failed: "تعذّر تحميل العيادة الافتراضية. لم يتغيّر شيء.", retry: "إعادة المحاولة", switchClinic: "العيادة",
    ownerLead: "ممارستك داخل رحلة الشفاء: ملفك وتوفرك وخدماتك وأسعارك وجدولك. ليست عيادة فعلية أو مستشفى.",
    managerLead: "أنت تساعد في إدارة عيادة هذا الاستشاري. يمكنك فقط ما سمح به الاستشاري، ولا ترى المرضى أو الحالات أو المستندات الطبية أو القرارات السريرية.",
    sections: { overview: "نظرة عامة", services: "الخدمات والأسعار", schedule: "الجدول", team: "مديرو العيادة", history: "سجل التغييرات" } as Record<Section, string>,
    professional: "الملف المهني", specialty: "التخصص", subspecialty: "التخصص الدقيق", careArea: "مجال الرعاية", credentials: "الاعتمادات",
    verified: "معتمد من رحلة الشفاء", notVerified: "غير معتمد", current: "سارية", renewal: "تحتاج إلى تجديد", capabilities: "القدرات السريرية المعتمدة",
    noCapabilities: "لم تُعتمد قدرات إضافية بعد. يعتمدها فريق الاعتماد في رحلة الشفاء.", assignable: "مؤهل لإسناد حالات جديدة", notAssignable: "غير مؤهل حاليًا لحالات جديدة",
    availability: "التوفر لحالات جديدة", accepting: "أستقبل حالات جديدة", notAccepting: "لا أستقبل حالات جديدة", reviewHours: "مدة المراجعة المتوقعة (ساعات)", save: "حفظ",
    publicProfile: "الملف العام", published: "منشور", notPublished: "لم يُنشر شيء بعد.", draft: "مسودة بانتظار موافقتك", draftByManager: "أعدّها",
    approvePublish: "الموافقة والنشر", discard: "تجاهل المسودة", editProfile: "تعديل الملف العام", headline: "العنوان", bio: "نبذة", languages: "اللغات", displayName: "الاسم المعروض",
    saveForApproval: "حفظ لموافقة الاستشاري", saveDraft: "حفظ المسودة", publishNow: "نشر الآن",
    settings: "إعدادات الموافقة", requireApproval: "تتطلب تغييرات مديري العيادة على الخدمات والأسعار موافقتي قبل تطبيقها",
    servicesLead: "خدماتك المهنية فقط. لا تُدرج هنا رسوم المستشفى أو الغرسات أو الإقامة أو باقات السفر أو خدمات الجهات الأخرى. تُحفظ الأسعار بالجنيه المصري، ويرى المريض عملته في العرض.",
    noServices: "لا توجد خدمات بعد.", code: "الرمز", kind: "النوع", price: "السعر", effective: "يسري من", expires: "ينتهي", status: "الحالة", active: "نشطة", retired: "موقوفة", revision: "الإصدار",
    edit: "تعديل", retire: "إيقاف", activate: "تفعيل", history: "السجل", closeHistory: "إغلاق السجل", pending: "تغييرات بانتظار الموافقة", noPending: "لا توجد تغييرات بانتظار الموافقة.",
    approve: "موافقة", reject: "رفض", rejectReason: "سبب الرفض", waiting: "بانتظار الاستشاري", by: "بواسطة",
    addService: "إضافة خدمة", editService: "تعديل الخدمة", serviceName: "اسم الخدمة", description: "الوصف", included: "يشمل", excluded: "لا يشمل",
    priceFrom: "السعر (جنيه مصري)", priceTo: "الحد الأعلى للنطاق (اختياري)", effectiveFrom: "يسري من", validUntil: "ينتهي في (اختياري)",
    submitChange: "حفظ التغيير", submitForApproval: "إرسال للموافقة", cancel: "إلغاء",
    approvalStatus: { PLATFORM_MANAGED: "حددتها رحلة الشفاء", CONSULTANT_APPROVED: "وافق عليها الاستشاري", APPLIED_WITHOUT_APPROVAL: "طُبّقت دون موافقة (إعداد العيادة)" } as Record<string, string>,
    changeType: { CREATE: "خدمة جديدة", UPDATE: "تعديل", RETIRE: "إيقاف", ACTIVATE: "إعادة تفعيل" } as Record<string, string>,
    changeStatus: { PENDING_APPROVAL: "بانتظار الموافقة", APPLIED: "مطبّق", REJECTED: "مرفوض" } as Record<string, string>,
    kinds: { INITIAL_CASE_REVIEW: "مراجعة أولية للحالة الطبية", VIDEO_CONSULTATION: "استشارة مرئية", IN_PERSON_CONSULTATION: "استشارة حضورية", FOLLOW_UP_CONSULTATION: "استشارة متابعة", PROFESSIONAL_FEE: "أتعاب الاستشاري المهنية", OTHER_PROFESSIONAL_SERVICE: "خدمة مهنية أخرى" } as Record<string, string>,
    scheduleLead: "مواعيد الاستشارة التي يعمل عليها فريقك. لا يمكن للمرضى حجز هذه المواعيد عبر الإنترنت بعد.", noSlots: "لا توجد مواعيد استشارة قادمة.",
    addSlot: "إضافة موعد استشارة", startsAt: "يبدأ", duration: "المدة (دقائق)", mode: "نوع الاستشارة", video: "مرئية", inPerson: "حضورية",
    note: "ملاحظة إدارية (دون معلومات سريرية)", addSlotButton: "إضافة الموعد", cancelSlot: "إلغاء الموعد", cancelled: "ملغى", open: "متاح",
    teamLead: "يساعد مديرو العيادة في الأعمال الإدارية فقط، ولا يرون المرضى أو الحالات أو المستندات الطبية أو الرسائل أو القرارات السريرية.",
    noManagers: "لا يوجد مديرو عيادة بعد.", invite: "دعوة مدير عيادة", name: "الاسم الكامل", email: "البريد الإلكتروني للعمل", invitePerson: "إرسال الدعوة",
    permissions: { SCHEDULE: "إدارة الجدول", PROFILE: "إعداد الملف العام", SERVICES: "إعداد الخدمات والأسعار" } as Record<ClinicPermission, string>,
    savePermissions: "حفظ الصلاحيات", revoke: "إلغاء الوصول", reinstate: "إعادة التفعيل", revoked: "ملغى", activeManager: "نشط",
    historyLead: "كل تغيير في عيادتك الافتراضية ومن أجراه.", noHistory: "لا توجد تغييرات مسجّلة بعد.", you: "الاستشاري", manager: "مدير العيادة",
  },
};
type Copy = typeof copy.en;
const PERMISSIONS: ClinicPermission[] = ["PROFILE", "SCHEDULE", "SERVICES"];

/** The page: sign-in, clinic selection and loading. The workspace below it is pure and testable. */
export function VirtualClinic({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const { user, loading: authLoading, signIn } = useAuth();
  const { clinics, loading } = useVirtualClinics(!!user);
  const [selected, setSelected] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("clinic"));
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ practitionerId: string; clinic: Clinic | null; failed: boolean } | null>(null);
  const current = clinics.find(c => c.practitionerId === selected) ?? clinics[0];
  const currentId = current?.practitionerId;

  const call: ClinicCall = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!user) throw new Error("AUTHENTICATION_REQUIRED");
    const response = await apiFetchAs(user.access_token, path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.message || t.failed); }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }, [user, t.failed]);

  // A reload keeps the clinic on screen until the fresh copy arrives, so the open section is not lost after a change.
  useEffect(() => {
    if (!currentId) return;
    let live = true;
    void call<Clinic>(`/clinics/${currentId}`)
      .then(clinic => { if (live) setResult({ practitionerId: currentId, clinic, failed: false }); })
      .catch(() => { if (live) setResult(previous => ({ practitionerId: currentId, clinic: previous?.practitionerId === currentId ? previous.clinic : null, failed: true })); });
    return () => { live = false; };
  }, [call, currentId, attempt]);
  const load = useCallback(() => setAttempt(n => n + 1), []);
  const shown = result && result.practitionerId === currentId ? result : null;
  const clinic = shown?.clinic ?? null;
  const failed = !!shown?.failed && !clinic;

  const frame = (children: React.ReactNode) => (
    <section className="portal-shell bg-[linear-gradient(180deg,var(--color-mist)_0%,#fff_32rem)]">
      <div className="container-site"><h1 className="headline">{t.title}</h1><div className="mt-6">{children}</div></div>
    </section>
  );
  if (authLoading) return frame(<p role="status" className="text-sm text-ink-500">{t.loading}</p>);
  if (!user) return frame(<div className="card p-5"><p className="text-ink-700">{t.signInLead}</p><button type="button" className="btn-primary mt-4" onClick={() => void signIn()}>{t.signIn}</button></div>);
  if (loading) return frame(<p role="status" className="text-sm text-ink-500">{t.loading}</p>);
  if (!current) return frame(<div className="card p-5"><p className="font-bold text-ink-800">{t.none}</p><p className="mt-1 text-sm text-ink-600">{t.noneBody}</p></div>);
  return frame(<>
    {clinics.length > 1 && <label className="mb-5 block max-w-sm text-sm font-bold">{t.switchClinic}
      <select className="field mt-1.5" value={current.practitionerId} onChange={e => { setSelected(e.target.value); window.history.replaceState({}, "", virtualClinicHref(locale, e.target.value)); }}>
        {clinics.map(c => <option key={c.practitionerId} value={c.practitionerId}>{c.consultantName}</option>)}
      </select>
    </label>}
    {failed ? <div role="alert" className="rounded-xl bg-alert-50 p-4 text-alert-800">{t.failed} <button type="button" className="link-cta" onClick={load}>{t.retry}</button></div>
      : clinic ? <ClinicWorkspace locale={locale} clinic={clinic} call={call} reload={load}/>
        : <p role="status" className="text-sm text-ink-500">{t.loading}</p>}
  </>);
}

/**
 * One clinic, as the backend returned it for this viewer. Sections the viewer has no permission for are not
 * offered, but that is courtesy only — every action is re-authorized by the backend.
 */
export function ClinicWorkspace({ locale, clinic, call, reload }: { locale: Locale; clinic: Clinic; call: ClinicCall; reload: () => void }) {
  const t = copy[locale];
  const owner = clinic.relation === "OWNER";
  const can = (p: ClinicPermission) => owner || clinic.permissions.includes(p);
  const sections: Section[] = ["overview", ...(can("SERVICES") ? ["services" as const] : []), ...(can("SCHEDULE") ? ["schedule" as const] : []),
    ...(owner ? ["team" as const, "history" as const] : [])];
  const [section, setSection] = useState<Section>("overview");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setError("");
    try { await call(path, method, body); reload(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : t.failed); return false; }
    finally { setBusy(false); }
  };
  const base = `/clinics/${clinic.practitionerId}`;
  const icons: Record<Section, React.ReactNode> = { overview: <Stethoscope size={16} aria-hidden/>, services: <Wallet size={16} aria-hidden/>, schedule: <CalendarClock size={16} aria-hidden/>, team: <Users size={16} aria-hidden/>, history: <History size={16} aria-hidden/> };
  return <div>
    <p className="max-w-3xl text-sm text-ink-600">{owner ? t.ownerLead : t.managerLead}</p>
    <p className="mt-2 font-bold text-ink-800">{clinic.professional.displayName}</p>
    <div role="tablist" aria-label={t.title} className="mt-5 flex flex-wrap gap-1 border-b border-line-strong">
      {sections.map(s => <button key={s} type="button" role="tab" aria-selected={section === s} onClick={() => setSection(s)}
        className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[0.85rem] font-bold ${section === s ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}>{icons[s]}{t.sections[s]}</button>)}
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-alert-50 p-3 text-sm text-alert-800">{error}</p>}
    <fieldset disabled={busy} className="mt-5 min-w-0 space-y-5">
      {section === "overview" && <Overview locale={locale} t={t} clinic={clinic} owner={owner} canProfile={can("PROFILE")} base={base} run={run}/>}
      {section === "services" && <Services locale={locale} t={t} clinic={clinic} owner={owner} base={base} run={run} call={call}/>}
      {section === "schedule" && <Schedule locale={locale} t={t} clinic={clinic} base={base} run={run}/>}
      {section === "team" && owner && <Team t={t} clinic={clinic} locale={locale} base={base} run={run}/>}
      {section === "history" && owner && <ChangeHistory locale={locale} t={t} base={base} call={call}/>}
    </fieldset>
  </div>;
}

type Run = (path: string, method: string, body?: unknown) => Promise<boolean>;

function Overview({ locale, t, clinic, owner, canProfile, base, run }: { locale: Locale; t: Copy; clinic: Clinic; owner: boolean; canProfile: boolean; base: string; run: Run }) {
  const p = clinic.professional;
  const [accepting, setAccepting] = useState(p.availabilityStatus === "AVAILABLE");
  const [hours, setHours] = useState(p.expectedReviewHours ? String(p.expectedReviewHours) : "");
  const [editing, setEditing] = useState(false);
  const source = clinic.draft ?? clinic.publicProfile;
  const submitProfile = (e: FormEvent<HTMLFormElement>, publish: boolean) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget.form ?? e.currentTarget);
    const body = { displayName: form.get("displayName"), headline: form.get("headline"), bio: form.get("bio"), languages: form.get("languages"), expectedVersion: clinic.version };
    void run(`${base}/profile-draft?publish=${publish}`, "PUT", body).then(ok => { if (ok) setEditing(false); });
  };
  return <>
    <section className="card p-4 sm:p-5" aria-label={t.professional}>
      <h2 className="font-bold text-brand-900">{t.professional}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t.specialty} value={p.specialty}/><Fact label={t.subspecialty} value={p.subspecialty}/>
        <Fact label={t.careArea} value={locale === "ar" ? p.careAreaAr ?? p.careArea : p.careAreaEn ?? p.careArea}/>
        <Fact label={t.credentials} value={`${p.credentialingStatus === "VERIFIED" ? t.verified : t.notVerified} · ${p.credentialsCurrent ? t.current : t.renewal}`}/>
      </dl>
      <p className="mt-4 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.capabilities}</p>
      {p.capabilities.length ? <ul className="mt-1.5 flex flex-wrap gap-2">{p.capabilities.map(c => <li key={`${c.type}:${c.code}`} className="rounded-full bg-brand-50 px-3 py-1 text-[0.8rem] font-semibold text-brand-800">{c.label}</li>)}</ul>
        : <p className="mt-1 text-sm text-ink-500">{t.noCapabilities}</p>}
      <p className={`mt-4 inline-flex items-center gap-1.5 text-sm font-bold ${p.assignable ? "text-brand-800" : "text-ink-600"}`}><ShieldCheck size={16} aria-hidden/>{p.assignable ? t.assignable : t.notAssignable}</p>
    </section>

    {owner && <section className="card p-4 sm:p-5" aria-label={t.availability}>
      <h2 className="font-bold text-brand-900">{t.availability}</h2>
      <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={e => { e.preventDefault(); void run(`${base}/availability`, "PUT", { availabilityStatus: accepting ? "AVAILABLE" : "UNAVAILABLE", expectedReviewHours: hours ? Number(hours) : null, expectedVersion: p.practitionerVersion }); }}>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={accepting} onChange={e => setAccepting(e.target.checked)}/>{accepting ? t.accepting : t.notAccepting}</label>
        <label className="block text-sm font-bold">{t.reviewHours}<input className="field mt-1.5" type="number" min={1} max={720} value={hours} onChange={e => setHours(e.target.value)}/></label>
        <button className="btn-primary">{t.save}</button>
      </form>
    </section>}

    <section className="card p-4 sm:p-5" aria-label={t.publicProfile}>
      <h2 className="font-bold text-brand-900">{t.publicProfile}</h2>
      {clinic.publicProfile.publishedAt ? <div className="mt-2 text-sm text-ink-700">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{t.published}</p>
        <p className="mt-1 font-bold">{clinic.publicProfile.displayName}</p>{clinic.publicProfile.headline && <p>{clinic.publicProfile.headline}</p>}
        {clinic.publicProfile.bio && <p className="mt-1 whitespace-pre-wrap">{clinic.publicProfile.bio}</p>}{clinic.publicProfile.languages && <p className="mt-1 text-ink-500">{clinic.publicProfile.languages}</p>}
      </div> : <p className="mt-1 text-sm text-ink-500">{t.notPublished}</p>}
      {clinic.draft && <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm">
        <p className="font-bold text-brand-800">{t.draft}{clinic.draft.updatedByName ? ` · ${t.draftByManager} ${clinic.draft.updatedByName}` : ""}</p>
        <p className="mt-1">{clinic.draft.displayName} {clinic.draft.headline ? `— ${clinic.draft.headline}` : ""}</p>
        {clinic.draft.bio && <p className="mt-1 whitespace-pre-wrap text-ink-700">{clinic.draft.bio}</p>}
        {owner && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => void run(`${base}/profile-draft/approve`, "POST", { expectedVersion: clinic.version })}>{t.approvePublish}</button>
          <button type="button" className="btn-secondary" onClick={() => void run(`${base}/profile-draft/discard`, "POST", { expectedVersion: clinic.version })}>{t.discard}</button>
        </div>}
      </div>}
      {canProfile && (editing ? <form className="mt-4 grid gap-3" onSubmit={e => submitProfile(e, false)}>
        <label className="block text-sm font-bold">{t.displayName}<input name="displayName" className="field mt-1.5" maxLength={160} defaultValue={source.displayName ?? clinic.professional.displayName}/></label>
        <label className="block text-sm font-bold">{t.headline}<input name="headline" className="field mt-1.5" maxLength={300} defaultValue={source.headline ?? ""}/></label>
        <label className="block text-sm font-bold">{t.bio}<textarea name="bio" className="field mt-1.5 min-h-28" maxLength={5000} defaultValue={source.bio ?? ""}/></label>
        <label className="block text-sm font-bold">{t.languages}<input name="languages" className="field mt-1.5" maxLength={300} defaultValue={source.languages ?? ""}/></label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">{owner ? t.saveDraft : t.saveForApproval}</button>
          {owner && <button type="button" className="btn-secondary" onClick={e => submitProfile(e as unknown as FormEvent<HTMLFormElement>, true)}>{t.publishNow}</button>}
          <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>{t.cancel}</button>
        </div>
      </form> : <button type="button" className="btn-secondary mt-4" onClick={() => setEditing(true)}>{t.editProfile}</button>)}
    </section>

    {owner && <section className="card p-4 sm:p-5" aria-label={t.settings}>
      <h2 className="font-bold text-brand-900">{t.settings}</h2>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={clinic.managerChangesRequireApproval}
        onChange={e => void run(`${base}/settings`, "PUT", { managerChangesRequireApproval: e.target.checked, expectedVersion: clinic.version })}/>{t.requireApproval}</label>
    </section>}
  </>;
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-500">{label}</dt><dd className="mt-0.5 font-semibold text-ink-800">{value || "—"}</dd></div>;
}

function priceText(s: { priceEgp: number; priceMaxEgp?: number | null }, locale: Locale) {
  return s.priceMaxEgp ? `${formatEgp(s.priceEgp, locale)} – ${formatEgp(s.priceMaxEgp, locale)}` : formatEgp(s.priceEgp, locale);
}

function Services({ locale, t, clinic, owner, base, run, call }: { locale: Locale; t: Copy; clinic: Clinic; owner: boolean; base: string; run: Run; call: ClinicCall }) {
  const [form, setForm] = useState<ClinicService | "new" | null>(null);
  const [history, setHistory] = useState<{ id: string; rows: ServiceChange[] } | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const pendingFor = new Set(clinic.pendingChanges.map(c => c.serviceId).filter(Boolean));
  const statusChange = (s: ClinicService) => void run(`${base}/service-changes`, "POST", { serviceId: s.id, changeType: s.active ? "RETIRE" : "ACTIVATE" });
  return <>
    <p className="max-w-3xl text-sm text-ink-600">{t.servicesLead}</p>
    <section className="card overflow-x-auto p-4 sm:p-5" aria-label={t.sections.services}>
      {clinic.services.length === 0 ? <p className="text-sm text-ink-500">{t.noServices}</p> :
        <table className="w-full min-w-[40rem] text-sm">
          <thead><tr className="text-start text-[0.7rem] uppercase tracking-[0.08em] text-ink-500">
            <th className="py-2 text-start">{t.serviceName}</th><th className="text-start">{t.kind}</th><th className="text-start">{t.price}</th><th className="text-start">{t.effective}</th><th className="text-start">{t.status}</th><th/>
          </tr></thead>
          <tbody>{clinic.services.map(s => <tr key={s.id} className="border-t border-line align-top">
            <td className="py-2"><strong>{s.serviceName}</strong><p className="text-[0.78rem] text-ink-500">{s.serviceCode} · {t.revision} {s.revision}</p></td>
            <td>{s.serviceKind ? t.kinds[s.serviceKind] ?? s.serviceKind : "—"}</td>
            <td>{priceText(s, locale)}</td>
            <td>{s.effectiveFrom ?? "—"}{s.validUntil ? ` → ${s.validUntil}` : ""}</td>
            <td>{s.active ? t.active : t.retired}<p className="text-[0.78rem] text-ink-500">{t.approvalStatus[s.approvalStatus] ?? s.approvalStatus}</p></td>
            <td className="whitespace-nowrap text-end">{pendingFor.has(s.id) ? <span className="text-[0.78rem] text-ink-500">{t.waiting}</span> : <span className="inline-flex gap-2">
              <button type="button" className="link-cta" onClick={() => setForm(s)}>{t.edit}</button>
              <button type="button" className="link-cta" onClick={() => statusChange(s)}>{s.active ? t.retire : t.activate}</button>
              <button type="button" className="link-cta" onClick={() => void call<ServiceChange[]>(`${base}/services/${s.id}/history`).then(rows => setHistory({ id: s.id, rows }))}>{t.history}</button>
            </span>}</td>
          </tr>)}</tbody>
        </table>}
      {history && <div className="mt-4 rounded-xl border border-line p-3 text-sm">
        <ul className="space-y-1">{history.rows.map(r => <li key={r.id}>{t.revision} {r.appliedRevision} · {t.changeType[r.changeType]} · {priceText(r, locale)} · {r.proposedByName ?? "—"}{r.decidedByName ? ` → ${r.decidedByName}` : ""} · {new Date(r.decidedAt ?? r.proposedAt).toLocaleDateString(locale)}</li>)}</ul>
        <button type="button" className="link-cta mt-2" onClick={() => setHistory(null)}>{t.closeHistory}</button>
      </div>}
      {!form && <button type="button" className="btn-secondary mt-4" onClick={() => setForm("new")}>{t.addService}</button>}
      {form && <ServiceForm t={t} service={form === "new" ? null : form} owner={owner} onCancel={() => setForm(null)}
        onSubmit={body => void run(`${base}/service-changes`, "POST", body).then(ok => { if (ok) setForm(null); })}/>}
    </section>

    <section className="card p-4 sm:p-5" aria-label={t.pending}>
      <h2 className="font-bold text-brand-900">{t.pending}</h2>
      {clinic.pendingChanges.length === 0 ? <p className="mt-1 text-sm text-ink-500">{t.noPending}</p> :
        <ul className="mt-2 divide-y divide-line">{clinic.pendingChanges.map(c => <li key={c.id} className="py-3 text-sm">
          <p><strong>{t.changeType[c.changeType]}: {c.serviceName}</strong> · {priceText(c, locale)} · {t.effective} {c.effectiveFrom}</p>
          <p className="text-ink-500">{t.by} {c.proposedByName ?? (c.proposedByRole === "CONSULTANT" ? t.you : t.manager)}</p>
          {owner ? (rejecting === c.id
            ? <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); const reason = new FormData(e.currentTarget).get("reason"); void run(`${base}/service-changes/${c.id}/reject`, "POST", { expectedVersion: c.version, reason }).then(ok => { if (ok) setRejecting(null); }); }}>
                <label className="block min-w-60 flex-1 text-sm font-bold">{t.rejectReason}<input name="reason" required maxLength={500} className="field mt-1.5"/></label>
                <button className="btn-primary">{t.reject}</button><button type="button" className="btn-secondary" onClick={() => setRejecting(null)}>{t.cancel}</button>
              </form>
            : <div className="mt-2 flex gap-2">
                <button type="button" className="btn-primary" onClick={() => void run(`${base}/service-changes/${c.id}/approve`, "POST", { expectedVersion: c.version })}><CheckCircle2 size={16} aria-hidden/>{t.approve}</button>
                <button type="button" className="btn-secondary" onClick={() => setRejecting(c.id)}>{t.reject}</button>
              </div>)
            : <p className="mt-1 text-[0.8rem] font-semibold text-ink-600">{t.waiting}</p>}
        </li>)}</ul>}
    </section>
  </>;
}

function ServiceForm({ t, service, owner, onSubmit, onCancel }: { t: Copy; service: ClinicService | null; owner: boolean; onSubmit: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
    onSubmit({
      serviceId: service?.id ?? null, changeType: service ? "UPDATE" : "CREATE", serviceCode: service ? null : text("serviceCode"),
      serviceName: text("serviceName"), serviceKind: text("serviceKind"), description: text("description"), includedScope: text("includedScope"), excludedScope: text("excludedScope"),
      currency: "EGP", priceEgp: text("priceEgp") ? Number(text("priceEgp")) : null, priceMaxEgp: text("priceMaxEgp") ? Number(text("priceMaxEgp")) : null,
      effectiveFrom: text("effectiveFrom"), validUntil: text("validUntil"),
    });
  };
  return <form className="mt-4 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2" onSubmit={submit} aria-label={service ? t.editService : t.addService}>
    <h3 className="font-bold text-brand-900 sm:col-span-2">{service ? `${t.editService}: ${service.serviceName}` : t.addService}</h3>
    {!service && <label className="block text-sm font-bold">{t.code}<input name="serviceCode" required maxLength={60} pattern="[A-Za-z0-9._\-]+" className="field mt-1.5"/></label>}
    <label className="block text-sm font-bold">{t.serviceName}<input name="serviceName" required maxLength={500} className="field mt-1.5" defaultValue={service?.serviceName}/></label>
    <label className="block text-sm font-bold">{t.kind}<select name="serviceKind" required className="field mt-1.5" defaultValue={service?.serviceKind ?? ""}>
      <option value="" disabled>—</option>{SERVICE_KINDS.map(k => <option key={k} value={k}>{t.kinds[k]}</option>)}</select></label>
    <label className="block text-sm font-bold">{t.priceFrom}<input name="priceEgp" required type="number" min={0} step="0.01" className="field mt-1.5" defaultValue={service?.priceEgp}/></label>
    <label className="block text-sm font-bold">{t.priceTo}<input name="priceMaxEgp" type="number" min={0} step="0.01" className="field mt-1.5" defaultValue={service?.priceMaxEgp ?? undefined}/></label>
    <label className="block text-sm font-bold">{t.effectiveFrom}<input name="effectiveFrom" type="date" className="field mt-1.5" defaultValue={service?.effectiveFrom ?? undefined}/></label>
    <label className="block text-sm font-bold">{t.validUntil}<input name="validUntil" type="date" className="field mt-1.5" defaultValue={service?.validUntil ?? undefined}/></label>
    <label className="block text-sm font-bold sm:col-span-2">{t.description}<textarea name="description" maxLength={4000} className="field mt-1.5" defaultValue={service?.description ?? ""}/></label>
    <label className="block text-sm font-bold">{t.included}<textarea name="includedScope" maxLength={4000} className="field mt-1.5" defaultValue={service?.includedScope ?? ""}/></label>
    <label className="block text-sm font-bold">{t.excluded}<textarea name="excludedScope" maxLength={4000} className="field mt-1.5" defaultValue={service?.excludedScope ?? ""}/></label>
    <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="btn-primary">{owner ? t.submitChange : t.submitForApproval}</button><button type="button" className="btn-secondary" onClick={onCancel}>{t.cancel}</button></div>
  </form>;
}

function Schedule({ locale, t, clinic, base, run }: { locale: Locale; t: Copy; clinic: Clinic; base: string; run: Run }) {
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const start = new Date(String(f.get("startsAt")));
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + Number(f.get("duration")) * 60_000);
    const target = e.currentTarget;
    void run(`${base}/slots`, "POST", { startsAt: start.toISOString(), endsAt: end.toISOString(), mode: f.get("mode"), note: String(f.get("note") ?? "").trim() || null }).then(ok => { if (ok) target.reset(); });
  };
  return <>
    <p className="max-w-3xl text-sm text-ink-600">{t.scheduleLead}</p>
    <section className="card p-4 sm:p-5" aria-label={t.sections.schedule}>
      {clinic.slots.length === 0 ? <p className="text-sm text-ink-500">{t.noSlots}</p> :
        <ul className="divide-y divide-line">{clinic.slots.map(s => <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
          <span><strong>{when.format(new Date(s.startsAt))}</strong> – {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(s.endsAt))} · {s.mode === "VIDEO" ? t.video : t.inPerson} · {s.status === "OPEN" ? t.open : t.cancelled}{s.note ? ` · ${s.note}` : ""}</span>
          {s.status === "OPEN" && <button type="button" className="link-cta" onClick={() => void run(`${base}/slots/${s.id}/cancel`, "POST", { expectedVersion: s.version })}>{t.cancelSlot}</button>}
        </li>)}</ul>}
      <form className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end" onSubmit={add} aria-label={t.addSlot}>
        <label className="block text-sm font-bold">{t.startsAt}<input name="startsAt" type="datetime-local" required className="field mt-1.5"/></label>
        <label className="block text-sm font-bold">{t.duration}<select name="duration" className="field mt-1.5" defaultValue="30">{[15, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m}</option>)}</select></label>
        <label className="block text-sm font-bold">{t.mode}<select name="mode" className="field mt-1.5" defaultValue="VIDEO"><option value="VIDEO">{t.video}</option><option value="IN_PERSON">{t.inPerson}</option></select></label>
        <button className="btn-primary">{t.addSlotButton}</button>
        <label className="block text-sm font-bold sm:col-span-4">{t.note}<input name="note" maxLength={500} className="field mt-1.5"/></label>
      </form>
    </section>
  </>;
}

function Team({ t, clinic, locale, base, run }: { t: Copy; clinic: Clinic; locale: Locale; base: string; run: Run }) {
  const [drafts, setDrafts] = useState<Record<string, ClinicPermission[]>>({});
  const toggle = (id: string, current: ClinicPermission[], p: ClinicPermission) => setDrafts(d => {
    const list = d[id] ?? current;
    return { ...d, [id]: list.includes(p) ? list.filter(x => x !== p) : [...list, p] };
  });
  const invite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const target = e.currentTarget;
    void run(`${base}/managers`, "POST", { name: f.get("name"), email: f.get("email"), permissions: PERMISSIONS.filter(p => f.get(p) === "on"), locale }).then(ok => { if (ok) target.reset(); });
  };
  return <>
    <p className="max-w-3xl text-sm text-ink-600">{t.teamLead}</p>
    <section className="card p-4 sm:p-5" aria-label={t.sections.team}>
      {clinic.managers.length === 0 ? <p className="text-sm text-ink-500">{t.noManagers}</p> :
        <ul className="divide-y divide-line">{clinic.managers.map(m => {
          const perms = drafts[m.id] ?? m.permissions;
          const active = m.status === "ACTIVE";
          return <li key={m.id} className="py-3 text-sm">
            <p><strong>{m.name}</strong>{m.email ? ` · ${m.email}` : ""} · {active ? t.activeManager : t.revoked}</p>
            <div className="mt-2 flex flex-wrap gap-4">{PERMISSIONS.map(p => <label key={p} className="flex items-center gap-1.5"><input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(m.id, perms, p)}/>{t.permissions[p]}</label>)}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => void run(`${base}/managers/${m.id}`, "PUT", { permissions: perms, active: true, expectedVersion: m.version })}>{active ? t.savePermissions : t.reinstate}</button>
              {active && <button type="button" className="btn-secondary" onClick={() => void run(`${base}/managers/${m.id}`, "PUT", { permissions: [], active: false, expectedVersion: m.version })}>{t.revoke}</button>}
            </div>
          </li>;
        })}</ul>}
    </section>
    <section className="card p-4 sm:p-5" aria-label={t.invite}>
      <h2 className="font-bold text-brand-900">{t.invite}</h2>
      <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={invite}>
        <label className="block text-sm font-bold">{t.name}<input name="name" required maxLength={160} className="field mt-1.5"/></label>
        <label className="block text-sm font-bold">{t.email}<input name="email" type="email" required maxLength={254} className="field mt-1.5"/></label>
        <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">{PERMISSIONS.map(p => <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name={p}/>{t.permissions[p]}</label>)}</div>
        <div className="sm:col-span-2"><button className="btn-primary">{t.invitePerson}</button></div>
      </form>
    </section>
  </>;
}

function ChangeHistory({ locale, t, base, call }: { locale: Locale; t: Copy; base: string; call: ClinicCall }) {
  const [rows, setRows] = useState<ClinicAuditEntry[] | null>(null);
  useEffect(() => { void call<ClinicAuditEntry[]>(`${base}/audit`).then(setRows).catch(() => setRows([])); }, [call, base]);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <section className="card p-4 sm:p-5" aria-label={t.sections.history}>
    <p className="text-sm text-ink-600">{t.historyLead}</p>
    {rows === null ? <p role="status" className="mt-2 text-sm text-ink-500">{t.loading}</p> : rows.length === 0 ? <p className="mt-2 text-sm text-ink-500">{t.noHistory}</p> :
      <ul className="mt-3 divide-y divide-line text-sm">{rows.map((r, i) => <li key={i} className="py-2">
        <strong>{r.event.replace(/^CLINIC_/, "").replaceAll("_", " ").toLowerCase()}</strong> · {r.actorName ?? (r.actorRole === "DOCTOR" ? t.you : t.manager)} · {when.format(new Date(r.occurredAt))}
      </li>)}</ul>}
  </section>;
}

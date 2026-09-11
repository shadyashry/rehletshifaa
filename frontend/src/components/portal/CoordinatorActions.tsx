"use client";

import { useState, type FormEvent } from "react";
import { ClipboardList, Link2, MessageSquareText, Plane, Send, UserRoundPlus, Users, XCircle } from "lucide-react";

import type { Locale } from "@/lib/i18n";

type VerifiedDoctor = { subject: string; displayName: string; specialty?: string; subspecialty?: string; careCategory?: string };
type CareCategory = { slug: string; nameEn: string; nameAr: string };
type StaffMember = { subject: string; name: string; role: string };
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;

/**
 * The form that does the work behind the current action, and nothing else. It appears only when the
 * backend's current action is a FOCUS step with a form on this page (assigning a consultant, Operations
 * or Finance). Every other step either lives in its own panel (the proposal) or is somebody else's move.
 */
export function CoordinatorActionForm({ locale, code, caseId, version, careCategory, doctors, categories, staff, busy, mutate }: {
  locale: Locale; code: string; caseId: string; version: number; careCategory?: string;
  doctors: VerifiedDoctor[]; categories: CareCategory[]; staff: StaffMember[]; busy: boolean; mutate: Mutate;
}) {
  const ar = locale === "ar";
  if (code === "ASSIGN_CONSULTANT")
    return <ActionFormShell id="case-actions" title={ar ? "تعيين استشاري معتمد" : "Assign a verified consultant"}
                            hint={ar ? "أكّد مجال رعاية الحالة أو صححه. يظهر فقط الاستشاريون المعتمدون والمتاحون المطابقون للمجال." : "Confirm or correct the care area. Only matching, available, verified consultants are listed."}>
      <ConsultantAssignment locale={locale} caseId={caseId} version={version} careCategory={careCategory} doctors={doctors} categories={categories} busy={busy} mutate={mutate}/>
    </ActionFormShell>;
  if (code === "ASSIGN_OPERATIONS" || code === "ASSIGN_FINANCE") {
    const role = code === "ASSIGN_OPERATIONS" ? "OPERATIONS" : "FINANCE";
    return <ActionFormShell id="case-actions" title={role === "OPERATIONS" ? (ar ? "تعيين فريق العمليات" : "Assign Operations") : (ar ? "تعيين المالية" : "Assign Finance")}
                            hint={role === "OPERATIONS" ? (ar ? "لترتيب السفر والوصول." : "To arrange travel and arrival.") : (ar ? "لاعتماد الخدمات المسعّرة يدويًا قبل الإصدار." : "To approve the manually priced services before release.")}>
      <TeamAssignment locale={locale} caseId={caseId} role={role} staff={staff} busy={busy} mutate={mutate}/>
    </ActionFormShell>;
  }
  return null;
}

function ActionFormShell({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return <section id={id} className="card p-4 sm:p-5" aria-label={title}>
    <h3 className="font-bold text-brand-900">{title}</h3>
    {hint && <p className="mt-0.5 text-[0.85rem] leading-6 text-ink-600">{hint}</p>}
    <div className="mt-3">{children}</div>
  </section>;
}

function ConsultantAssignment({ locale, caseId, version, careCategory, doctors, categories, busy, mutate }: {
  locale: Locale; caseId: string; version: number; careCategory?: string; doctors: VerifiedDoctor[]; categories: CareCategory[]; busy: boolean; mutate: Mutate;
}) {
  const ar = locale === "ar";
  const [category, setCategory] = useState(careCategory ?? "");
  const [consultant, setConsultant] = useState("");
  // Reset the editable selections when the case or its stored care area changes underneath the form.
  const [syncKey, setSyncKey] = useState(`${caseId}|${careCategory ?? ""}`);
  if (syncKey !== `${caseId}|${careCategory ?? ""}`) { setSyncKey(`${caseId}|${careCategory ?? ""}`); setCategory(careCategory ?? ""); setConsultant(""); }
  const consultants = doctors.filter(doc => doc.careCategory === category);
  // A corrected care area is saved as part of assigning, so there is never a separate "save" step.
  const assign = async () => {
    if (!consultant) return;
    if (category !== (careCategory ?? "")) {
      const saved = await mutate(`/coordinator/cases/${caseId}/care-category`, { careCategory: category, expectedVersion: version, reason: careCategory ? "Coordinator corrected case care area" : "Coordinator classified case care area" }, "PUT");
      if (!saved) return;
    }
    await mutate(`/coordinator/cases/${caseId}/assignments`, { assigneeSubject: consultant, assigneeRole: "DOCTOR", assignmentType: "PRIMARY", pod: null, reason: "Assigned to consultant" }).then(r => { if (r) setConsultant(""); });
  };
  return <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <label className="block text-sm font-bold">{ar ? "مجال رعاية الحالة" : "Case care area"}
      <select className="field mt-1.5" value={category} onChange={e => { setCategory(e.target.value); setConsultant(""); }} required>
        <option value="" disabled>{ar ? "اختر مجال الرعاية" : "Select a care area"}</option>
        {categories.map(cat => <option key={cat.slug} value={cat.slug}>{ar ? cat.nameAr : cat.nameEn}</option>)}
      </select>
    </label>
    <label className="block text-sm font-bold">{ar ? "الاستشاري" : "Consultant"}
      <select className="field mt-1.5" value={consultant} onChange={e => setConsultant(e.target.value)} disabled={!category} required>
        <option value="" disabled>{ar ? "اختر استشاريًا مطابقًا" : "Select a matching consultant"}</option>
        {consultants.map(doc => <option key={doc.subject} value={doc.subject}>{doc.displayName}{doc.subspecialty ? ` · ${doc.subspecialty}` : doc.specialty ? ` · ${doc.specialty}` : ""}</option>)}
      </select>
    </label>
    <button type="button" className="btn-primary" disabled={!consultant || busy} onClick={() => void assign()}>{ar ? "تأكيد التعيين" : "Confirm assignment"}</button>
    {category && consultants.length === 0 && <p className="text-sm text-ink-500 sm:col-span-3">{ar ? "لا يوجد استشاريون معتمدون متاحون لهذا المجال حاليًا." : "No verified consultants are currently available for this care area."}</p>}
  </div>;
}

function TeamAssignment({ locale, caseId, role, staff, busy, mutate }: { locale: Locale; caseId: string; role: "OPERATIONS" | "FINANCE"; staff: StaffMember[]; busy: boolean; mutate: Mutate }) {
  const ar = locale === "ar";
  const members = staff.filter(person => person.role === role || person.role === role + "_LEAD");
  return <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={e => submit(e, data => mutate(`/coordinator/cases/${caseId}/assignments`, { assigneeSubject: data.get("assignee"), assigneeRole: role, assignmentType: "PRIMARY", pod: null, reason: `Assigned to ${role.toLowerCase()}` }))}>
    <label className="block text-sm font-bold">{ar ? "عضو الفريق" : "Team member"}
      <select name="assignee" className="field mt-1.5" required defaultValue="">
        <option value="">{ar ? "اختر عضو الفريق" : "Select team member"}</option>
        {members.map(person => <option key={person.subject} value={person.subject}>{person.name}</option>)}
      </select>
    </label>
    <button className="btn-primary" disabled={busy}>{ar ? "تعيين" : "Assign"}</button>
  </form>;
}

/**
 * "More actions": the state-valid utilities and exceptions the backend listed, one line each, in a drawer.
 * Nothing here is a workflow step, and nothing appears that the backend did not offer for this state.
 */
export function MoreActions({ locale, caseId, available, travelPackage, version, busy, mutate, onRequestInformation, onRecordResponse, onAdministration, proposalVersionId }: {
  locale: Locale; caseId: string; available: string[]; travelPackage: boolean; version: number; busy: boolean; mutate: Mutate;
  onRequestInformation: () => void; onRecordResponse: () => void; onAdministration?: () => void; proposalVersionId?: string;
}) {
  const ar = locale === "ar";
  const items: { code: string; label: string; hint: string; icon: React.ReactNode; onClick: () => void; tone?: "danger" }[] = [];
  const has = (code: string) => available.includes(code);
  if (has("REQUEST_INFORMATION")) items.push({ code: "REQUEST_INFORMATION", icon: <ClipboardList size={16} aria-hidden/>, label: ar ? "طلب معلومات إضافية" : "Request more information", hint: ar ? "يُرسل طلبًا آمنًا للمريض وينقل المسؤولية إليه حتى يرد." : "Sends a secure request to the patient; the case waits on them until they respond.", onClick: onRequestInformation });
  if (has("RECORD_PATIENT_RESPONSE")) items.push({ code: "RECORD_PATIENT_RESPONSE", icon: <MessageSquareText size={16} aria-hidden/>, label: ar ? "تسجيل رد المريض" : "Record patient response", hint: ar ? "ما أرسله المريض عبر واتساب أو الهاتف، مع حفظ المصدر." : "What the patient sent by WhatsApp or phone, with provenance kept.", onClick: onRecordResponse });
  if (has("RESEND_PROPOSAL_LINK") && proposalVersionId) items.push({ code: "RESEND_PROPOSAL_LINK", icon: <Send size={16} aria-hidden/>, label: ar ? "إعادة إرسال رابط العرض" : "Resend proposal link", hint: ar ? "يُلغي الرابط السابق ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرضًا جديدًا." : "Revokes the previous link and sends a fresh secure one. Does not create a new proposal.", onClick: () => void mutate(`/coordinator/cases/${caseId}/proposals/${proposalVersionId}/resend`) });
  if (has("RESEND_ONBOARDING_LINK")) items.push({ code: "RESEND_ONBOARDING_LINK", icon: <Link2 size={16} aria-hidden/>, label: ar ? "إعادة إرسال رابط تفعيل الملف" : "Resend profile link", hint: ar ? "يُلغي الرابط السابق ويُرسل رابطًا آمنًا جديدًا إلى وسيلة تواصل المريض المسجّلة." : "Revokes the previous link and sends a fresh secure one to the patient's on-file contact.", onClick: () => void mutate(`/coordinator/cases/${caseId}/onboarding-link/resend`) });
  if (has("MOVE_TO_INTAKE_REVIEW")) items.push({ code: "MOVE_TO_INTAKE_REVIEW", icon: <UserRoundPlus size={16} aria-hidden/>, label: ar ? "العودة إلى مراجعة الاستقبال" : "Move back to intake review", hint: ar ? "دون انتظار رد المريض." : "Without waiting for the patient's reply.", onClick: () => void mutate(`/coordinator/cases/${caseId}/transition`, { targetStatus: "INTAKE_REVIEW", expectedVersion: version }) });
  if (has("SET_TRAVEL_PACKAGE")) items.push({ code: "SET_TRAVEL_PACKAGE", icon: <Plane size={16} aria-hidden/>, label: travelPackage ? (ar ? "إلغاء باقة السفر المتكاملة" : "Turn off the full travel package") : (ar ? "تفعيل باقة السفر المتكاملة" : "Turn on the full travel package"), hint: ar ? "تشمل الطيران والتأشيرة والإقامة والوصول؛ عند التفعيل يُشرَك فريق العمليات قبل إرسال العرض." : "Flight, visa, accommodation and arrival; when on, Operations prepares the plan before the proposal is sent.", onClick: () => void mutate(`/coordinator/cases/${caseId}/travel-package`, { requested: !travelPackage }, "PUT") });
  if (onAdministration) items.push({ code: "ADMINISTRATION", icon: <Users size={16} aria-hidden/>, label: ar ? "إدارة الحالة" : "Case administration", hint: ar ? "إعادة إسناد المنسق." : "Reassign the coordinator.", onClick: onAdministration });
  if (has("CANCEL_CASE")) items.push({ code: "CANCEL_CASE", tone: "danger", icon: <XCircle size={16} aria-hidden/>, label: ar ? "إلغاء الحالة" : "Cancel case", hint: ar ? "إجراء نهائي." : "This cannot be undone.", onClick: () => { if (window.confirm(ar ? "هل تريد إلغاء الحالة؟" : "Cancel this case?")) void mutate(`/coordinator/cases/${caseId}/transition`, { targetStatus: "CANCELLED", expectedVersion: version }); } });

  if (!items.length) return <p className="text-sm text-ink-500">{ar ? "لا توجد إجراءات إضافية متاحة في هذه المرحلة." : "No additional actions are available at this stage."}</p>;
  return <ul className="divide-y divide-line">
    {items.map(item => (
      <li key={item.code}>
        <button type="button" disabled={busy} onClick={item.onClick}
                className={`flex w-full items-start gap-3 py-3 text-start transition hover:bg-mist/70 disabled:opacity-60 ${item.tone === "danger" ? "text-alert-700" : "text-ink-800"}`}>
          <span className={`mt-0.5 flex-none ${item.tone === "danger" ? "text-alert-600" : "text-brand-600"}`}>{item.icon}</span>
          <span className="min-w-0">
            <span className="block text-[0.9rem] font-bold">{item.label}</span>
            <span className="block text-[0.8rem] leading-5 text-ink-500">{item.hint}</span>
          </span>
        </button>
      </li>
    ))}
  </ul>;
}

function submit(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<unknown>) {
  event.preventDefault(); const form = event.currentTarget;
  void action(new FormData(form)).then(result => { if (result) form.reset(); });
}

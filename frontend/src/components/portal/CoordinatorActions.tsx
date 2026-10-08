"use client";

import { useRef, useState, type FormEvent } from "react";
import { ClipboardList, Handshake, Link2, MessageSquareText, Plane, Send, UserRoundPlus, Users, XCircle } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { EligibleConsultantPicker, ReferralConfirmation, type Load } from "@/components/portal/ConsultantRouting";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { RecordProposalDecision, type RecordableProposal } from "@/components/portal/RecordProposalDecision";
import { careAreaLabel, fillTemplate } from "@/lib/portal-labels";

type CareCategory = { slug: string; nameEn: string; nameAr: string };
type StaffMember = { subject: string; name: string; role: string };
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;

/**
 * The form that does the work behind the current action, and nothing else. It renders inside the current-action panel
 * when the backend's current action is a FOCUS step with a form (assigning a consultant, confirming a consultant
 * referral, Operations or Finance), so the panel's title is the step and this form is its one control — never a
 * second card further down the page. Every other step either lives in its own panel (the proposal) or is somebody
 * else's move.
 */
export function CoordinatorActionForm({ locale, code, caseId, version, careCategory, categories, staff, busy, mutate, load, consultantsHref, proposal }: {
  locale: Locale; code: string; caseId: string; version: number; careCategory?: string;
  categories: CareCategory[]; staff: StaffMember[]; busy: boolean; mutate: Mutate; load: Load;
  /** The Control Center's Consultants page, for people who can open it; the next step when nobody is eligible. */
  consultantsHref?: string | null;
  /** The released proposal whose decision is recorded (RECORD_PROPOSAL_DECISION). */
  proposal?: RecordableProposal | null;
}) {
  const ar = locale === "ar";
  const work = useWorkCopy();
  if (code === "RECORD_PROPOSAL_DECISION" && proposal)
    return <ActionFormShell id="case-actions" busy={busy} title={work.recordDecision.title} hint={work.recordDecision.hint}>
      <RecordProposalDecision key={proposal.versionId} locale={locale} caseId={caseId} proposal={proposal} busy={busy} mutate={mutate}/>
    </ActionFormShell>;
  if (code === "ASSIGN_CONSULTANT")
    return <ActionFormShell id="case-actions" busy={busy} title={work.assignConsultant.title} hint={work.assignConsultant.hint}>
      <ConsultantAssignment locale={locale} caseId={caseId} version={version} careCategory={careCategory} categories={categories} busy={busy} mutate={mutate} load={load} consultantsHref={consultantsHref}/>
    </ActionFormShell>;
  if (code === "CONFIRM_REFERRAL")
    return <ActionFormShell id="case-actions" busy={busy} title={ar ? "تأكيد إحالة الاستشاري" : "Confirm the consultant referral"}
                            hint={ar ? "لا يحصل أي استشاري على الحالة حتى تؤكد أنت ويقبل هو." : "No consultant gains the case until you confirm and they accept."}>
      <ReferralConfirmation locale={locale} caseId={caseId} careCategory={careCategory} categories={categories} busy={busy} load={load} mutate={mutate}/>
    </ActionFormShell>;
  if (code === "ASSIGN_OPERATIONS" || code === "ASSIGN_FINANCE") {
    const role = code === "ASSIGN_OPERATIONS" ? "OPERATIONS" : "FINANCE";
    return <ActionFormShell id="case-actions" busy={busy} title={role === "OPERATIONS" ? (ar ? "تعيين فريق العمليات" : "Assign Operations") : (ar ? "تعيين المالية" : "Assign Finance")}
                            hint={role === "OPERATIONS" ? (ar ? "لترتيب السفر والوصول." : "To arrange travel and arrival.") : (ar ? "لاعتماد الخدمات المسعّرة يدويًا قبل الإصدار." : "To approve the manually priced services before release.")}>
      <TeamAssignment locale={locale} caseId={caseId} role={role} staff={staff} busy={busy} mutate={mutate}/>
    </ActionFormShell>;
  }
  return null;
}

/** Sits inside the current-action panel under its title, so it names itself for assistive tech only and adds no card. */
function ActionFormShell({ id, title, hint, busy = false, children }: { id: string; title: string; hint?: string; busy?: boolean; children: React.ReactNode }) {
  return <div id={id} role="group" aria-label={title} className="mt-4 border-t border-line pt-4">
    {hint && <p className="max-w-2xl text-[0.85rem] leading-6 text-ink-600">{hint}</p>}
    {/* Outside the workspace fieldset, so it follows the in-flight state itself. */}
    <fieldset disabled={busy} className="mt-3 min-w-0">{children}</fieldset>
  </div>;
}

function ConsultantAssignment({ locale, caseId, version, careCategory, categories, busy, mutate, load, consultantsHref }: {
  locale: Locale; caseId: string; version: number; careCategory?: string; categories: CareCategory[]; busy: boolean; mutate: Mutate; load: Load;
  consultantsHref?: string | null;
}) {
  const ar = locale === "ar";
  const work = useWorkCopy();
  const t = work.assignConsultant;
  const select = useRef<HTMLSelectElement>(null);
  const [category, setCategory] = useState(careCategory ?? "");
  const [consultant, setConsultant] = useState("");
  // Reset the editable selections when the case or its stored care area changes underneath the form.
  const [syncKey, setSyncKey] = useState(`${caseId}|${careCategory ?? ""}`);
  if (syncKey !== `${caseId}|${careCategory ?? ""}`) { setSyncKey(`${caseId}|${careCategory ?? ""}`); setCategory(careCategory ?? ""); setConsultant(""); }
  // A corrected care area is saved as part of assigning, so there is never a separate "save" step.
  const assign = async () => {
    if (!consultant) return;
    if (category !== (careCategory ?? "")) {
      const saved = await mutate(`/coordinator/cases/${caseId}/care-category`, { careCategory: category, expectedVersion: version, reason: careCategory ? "Coordinator corrected case care area" : "Coordinator classified case care area" }, "PUT");
      if (!saved) return;
    }
    await mutate(`/coordinator/cases/${caseId}/consultant-assignment`, { practitionerId: consultant, reason: "Assigned to consultant" }).then(r => { if (r) setConsultant(""); });
  };
  // The case's own care area stays selected even when the category list lacks it (not loaded, renamed or retired):
  // a blank select would silently ask the coordinator to re-classify a case that is already classified.
  const options = careCategory && !categories.some(cat => cat.slug === careCategory)
    ? [...categories, { slug: careCategory, nameEn: careAreaLabel(careCategory, work.careAreas), nameAr: careAreaLabel(careCategory, work.careAreas) }]
    : categories;
  const areaName = category ? (options.find(cat => cat.slug === category)?.[ar ? "nameAr" : "nameEn"] ?? careAreaLabel(category, work.careAreas)) : "";
  const unsetHintId = `care-area-unset-${caseId}`;
  // Nobody eligible is a routing problem, not the end of the task: offer the next move the coordinator can make.
  const nextSteps = <ul className="mt-2 space-y-1 text-[0.875rem]">
    <li><button type="button" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current" onClick={() => select.current?.focus()}>{t.otherArea}</button></li>
    {consultantsHref
      ? <li><a className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-line-strong underline-offset-4 hover:decoration-current" href={consultantsHref}>{fillTemplate(t.seeConsultants, { area: areaName })}</a></li>
      : <li className="text-ink-600">{fillTemplate(t.askLead, { area: areaName })}</li>}
  </ul>;
  return <div className="grid gap-3">
    <label className="block max-w-sm text-sm font-bold">{t.careArea}
      <select ref={select} className="field mt-1.5" value={category} onChange={e => { setCategory(e.target.value); setConsultant(""); }} required
              aria-describedby={careCategory ? undefined : unsetHintId}>
        <option value="" disabled>{t.choose}</option>
        {options.map(cat => <option key={cat.slug} value={cat.slug}>{ar ? cat.nameAr : cat.nameEn}</option>)}
      </select>
    </label>
    {!careCategory && <p id={unsetHintId} className="-mt-1 max-w-prose text-[0.85rem] leading-6 text-ink-600">{t.unset}</p>}
    {category && <EligibleConsultantPicker locale={locale} caseId={caseId} careArea={category} value={consultant} onChange={setConsultant} load={load} empty={nextSteps}
      footer={<div className="mt-3"><button type="button" className="btn-primary" disabled={!consultant || busy} onClick={() => void assign()}>{t.submit}</button></div>}/>}
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
export function MoreActions({ locale, caseId, available, travelPackage, version, busy, mutate, onRequestInformation, onRecordResponse, onRecordDecision, onAdministration, proposalVersionId }: {
  locale: Locale; caseId: string; available: string[]; travelPackage: boolean; version: number; busy: boolean; mutate: Mutate;
  onRequestInformation: () => void; onRecordResponse: () => void; onAdministration?: () => void; proposalVersionId?: string;
  /** The patient decided on a call (Arabic assisted path) and nobody asked through the page first. */
  onRecordDecision?: () => void;
}) {
  const ar = locale === "ar";
  const work = useWorkCopy();
  const items: { code: string; label: string; hint: string; icon: React.ReactNode; onClick: () => void; tone?: "danger" }[] = [];
  const has = (code: string) => available.includes(code);
  if (has("REQUEST_INFORMATION")) items.push({ code: "REQUEST_INFORMATION", icon: <ClipboardList size={16} aria-hidden/>, label: ar ? "طلب معلومات إضافية" : "Request more information", hint: ar ? "يُرسل طلبًا آمنًا للمريض وينقل المسؤولية إليه حتى يرد." : "Sends a secure request to the patient; the case waits on them until they respond.", onClick: onRequestInformation });
  if (has("RECORD_PATIENT_RESPONSE")) items.push({ code: "RECORD_PATIENT_RESPONSE", icon: <MessageSquareText size={16} aria-hidden/>, label: ar ? "تسجيل رد المريض" : "Record patient response", hint: ar ? "ما أرسله المريض عبر واتساب أو الهاتف، مع حفظ المصدر." : "What the patient sent by WhatsApp or phone, with provenance kept.", onClick: onRecordResponse });
  if (has("RECORD_PROPOSAL_DECISION") && onRecordDecision) items.push({ code: "RECORD_PROPOSAL_DECISION", icon: <Handshake size={16} aria-hidden/>, label: work.recordDecision.title, hint: work.recordDecision.moreHint, onClick: onRecordDecision });
  if (has("RESEND_PROPOSAL_LINK") && proposalVersionId) items.push({ code: "RESEND_PROPOSAL_LINK", icon: <Send size={16} aria-hidden/>, label: ar ? "إعادة إرسال رابط العرض" : "Resend proposal link", hint: ar ? "يُلغي الرابط السابق ويُرسل رابطًا آمنًا جديدًا. لا يُنشئ عرضًا جديدًا." : "Revokes the previous link and sends a fresh secure one. Does not create a new proposal.", onClick: () => void mutate(`/coordinator/cases/${caseId}/proposals/${proposalVersionId}/resend`) });
  if (has("RESEND_ONBOARDING_LINK")) items.push({ code: "RESEND_ONBOARDING_LINK", icon: <Link2 size={16} aria-hidden/>, label: ar ? "إعادة إرسال رابط تفعيل الملف" : "Resend profile link", hint: ar ? "يُلغي الرابط السابق ويُرسل رابطًا آمنًا جديدًا إلى وسيلة تواصل المريض المسجّلة." : "Revokes the previous link and sends a fresh secure one to the patient's on-file contact.", onClick: () => void mutate(`/coordinator/cases/${caseId}/onboarding-link/resend`) });
  if (has("MOVE_TO_INTAKE_REVIEW")) items.push({ code: "MOVE_TO_INTAKE_REVIEW", icon: <UserRoundPlus size={16} aria-hidden/>, label: ar ? "العودة إلى مراجعة الاستقبال" : "Move back to intake review", hint: ar ? "دون انتظار رد المريض." : "Without waiting for the patient's reply.", onClick: () => void mutate(`/coordinator/cases/${caseId}/transition`, { targetStatus: "INTAKE_REVIEW", expectedVersion: version }) });
  if (has("SET_TRAVEL_PACKAGE")) items.push({ code: "SET_TRAVEL_PACKAGE", icon: <Plane size={16} aria-hidden/>, label: travelPackage ? (ar ? "إلغاء باقة السفر المتكاملة" : "Turn off the full travel package") : (ar ? "تفعيل باقة السفر المتكاملة" : "Turn on the full travel package"), hint: ar ? "تشمل الطيران والتأشيرة والإقامة والوصول؛ عند التفعيل يُشرَك فريق العمليات قبل إرسال العرض." : "Flight, visa, accommodation and arrival; when on, Operations prepares the plan before the proposal is sent.", onClick: () => void mutate(`/coordinator/cases/${caseId}/travel-package`, { requested: !travelPackage }, "PUT") });
  if (onAdministration) items.push({ code: "ADMINISTRATION", icon: <Users size={16} aria-hidden/>, label: ar ? "نقل ملكية الحالة" : "Transfer case ownership", hint: ar ? "سلّم هذه الحالة إلى منسق آخر في فريقك." : "Hand this case to another coordinator on your team.", onClick: onAdministration });
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

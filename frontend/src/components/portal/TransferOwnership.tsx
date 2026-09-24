"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import type { Locale } from "@/lib/i18n";

type StaffMember = { subject: string; name: string; role: string };
type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;

/**
 * Transfer case ownership: the one authoritative way to change the coordinator who owns a case
 * (`POST /coordinator/cases/{id}/coordinator-assignment`, coordinator leads only). Two short steps — choose the
 * coordinator and say why, then review exactly what changes before confirming.
 *
 * <p>What the copy promises is what the backend does: the new coordinator becomes the case owner, open coordinator
 * work on the case moves with the ownership, other roles' work and completed work are untouched, the history keeps
 * both owners and the reason, and nobody is notified automatically.
 */
export function TransferOwnership({ locale, caseId, caseNumber, currentOwner, currentOwnerName, mySubject, staff, busy, mutate, onClose }: {
  locale: Locale; caseId: string; caseNumber: string; currentOwner?: string; currentOwnerName?: string; mySubject?: string;
  staff: StaffMember[]; busy: boolean; mutate: Mutate; onClose: () => void;
}) {
  const ar = locale === "ar";
  const t = ar ? {
    intro: "يصبح المنسق الذي تختاره مالك هذه الحالة والمسؤول عنها.", find: "ابحث عن منسق", coordinator: "المنسق الجديد", you: "(أنت)", lead: "قائد فريق",
    none: "لا يوجد منسقون ضمن فريقك بعد. يضيف مسؤول النظام المنسقين إلى هيكل قيادتك قبل أن تتمكن من نقل الحالات.", noMatch: "لا يوجد منسق بهذا الاسم في فريقك.",
    reason: "سبب النقل", reasonHint: "يُحفظ في سجل التعيينات.", placeholder: "مثال: إعادة توزيع عبء العمل أو تغطية إجازة", next: "مراجعة النقل", back: "رجوع", cancel: "إلغاء",
    review: "راجع قبل النقل", caseLabel: "الحالة", from: "من", to: "إلى", unowned: "بلا مالك", changes: "ما الذي يتغير", same: "ما الذي لا يتغير", notify: "الإشعارات",
    c1: (n: string) => <>يصبح <bdi>{n}</bdi> مالك الحالة (المنسق المسؤول).</>, c2: (n: string) => <>ينتقل عمل التنسيق المفتوح على هذه الحالة إلى <bdi>{n}</bdi>.</>,
    c3: "يفقد المالك السابق الوصول إلى الحالة ما لم يكن قائد فريق المالك الجديد.",
    s1: "تعيينات الاستشاري والعمليات والمالية وعملهم.", s2: "مرحلة الحالة والعمل المكتمل.", s3: "سجل التعيينات يحتفظ بالمالك السابق وبالسبب.",
    n1: (n: string) => <>لا يُرسَل إشعار تلقائي إلى <bdi>{n}</bdi> — أبلغه بالتسليم.</>,
    confirm: "نقل الملكية", done: (n: string) => <>تم نقل الملكية إلى <bdi>{n}</bdi>. لم يُرسَل إشعار تلقائي.</>, close: "إغلاق",
  } : {
    intro: "The coordinator you choose becomes the owner of this case and responsible for it.", find: "Find a coordinator", coordinator: "New coordinator", you: "(you)", lead: "Team lead",
    none: "No coordinators report to you yet. A system administrator adds coordinators to your reporting team before cases can be transferred.", noMatch: "No coordinator on your team matches that name.",
    reason: "Reason for the transfer", reasonHint: "Kept in the assignment history.", placeholder: "For example: workload balancing or leave coverage", next: "Review transfer", back: "Back", cancel: "Cancel",
    review: "Review before transferring", caseLabel: "Case", from: "From", to: "To", unowned: "No owner", changes: "What changes", same: "What stays the same", notify: "Notifications",
    c1: (n: string) => <><bdi>{n}</bdi> becomes the case owner (the responsible coordinator).</>, c2: (n: string) => <>Open coordinator work on this case moves to <bdi>{n}</bdi>.</>,
    c3: "The previous owner loses access to the case unless they lead the new owner's team.",
    s1: "Consultant, Operations and Finance assignments and their work.", s2: "The case stage and completed work.", s3: "Assignment history keeps the previous owner and your reason.",
    n1: (n: string) => <><bdi>{n}</bdi> is not notified automatically — let them know about the handover.</>,
    confirm: "Transfer ownership", done: (n: string) => <>Ownership transferred to <bdi>{n}</bdi>. Nobody was notified automatically.</>, close: "Close",
  };
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<"choose" | "review" | "done">("choose");
  // The confirm button disappears with the review, so focus moves to the result instead of being lost.
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (step === "done") result.current?.focus(); }, [step]);

  // Valid targets only: coordinators on the lead's own reporting team (the backend scopes the directory and refuses
  // anyone else), never the current owner. Disabled accounts are not in the directory.
  const coordinators = useMemo(() => staff.filter((person) => (person.role === "COORDINATOR" || person.role === "COORDINATOR_LEAD") && person.subject !== currentOwner), [staff, currentOwner]);
  const shown = coordinators.filter((person) => person.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const chosen = coordinators.find((person) => person.subject === assignee);
  const name = chosen?.name ?? "";

  const transfer = async () => {
    const saved = await mutate(`/coordinator/cases/${caseId}/coordinator-assignment`, { assigneeSubject: assignee, reason: reason.trim() });
    if (saved) setStep("done");
  };

  if (step === "done") return <div className="space-y-4">
    <p ref={result} tabIndex={-1} role="status" className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800 outline-none">{t.done(name)}</p>
    <button type="button" className="btn-secondary w-full justify-center" onClick={onClose}>{t.close}</button>
  </div>;

  if (!coordinators.length) return <p className="rounded-xl border border-dashed border-line-strong bg-mist p-4 text-sm text-ink-600">{t.none}</p>;

  if (step === "review") return <section aria-labelledby="transfer-review-title" className="space-y-4">
    <h3 id="transfer-review-title" className="font-bold text-brand-900">{t.review}</h3>
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-ink-500">{t.caseLabel}</dt><dd className="font-semibold text-ink-800"><bdi>{caseNumber}</bdi></dd>
      <dt className="text-ink-500">{t.from}</dt><dd className="font-semibold text-ink-800">{currentOwnerName ? <bdi>{currentOwnerName}</bdi> : t.unowned}</dd>
      <dt className="text-ink-500">{t.to}</dt><dd className="font-semibold text-ink-800"><bdi>{name}</bdi></dd>
      <dt className="text-ink-500">{t.reason}</dt><dd className="text-ink-800">{reason.trim()}</dd>
    </dl>
    <div>
      <h4 className="text-sm font-bold text-ink-800">{t.changes}</h4>
      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-ink-700"><li>{t.c1(name)}</li><li>{t.c2(name)}</li><li>{t.c3}</li></ul>
    </div>
    <div>
      <h4 className="text-sm font-bold text-ink-800">{t.same}</h4>
      <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-ink-700"><li>{t.s1}</li><li>{t.s2}</li><li>{t.s3}</li></ul>
    </div>
    <div>
      <h4 className="text-sm font-bold text-ink-800">{t.notify}</h4>
      <p className="mt-1 text-sm text-ink-700">{t.n1(name)}</p>
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setStep("choose")}>{t.back}</button>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void transfer()}>{t.confirm}</button>
    </div>
  </section>;

  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (assignee && reason.trim()) setStep("review"); }}>
    <p className="text-sm text-ink-600">{t.intro}</p>
    <label className="relative block">
      <span className="sr-only">{t.find}</span>
      <Search aria-hidden size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-400"/>
      <input type="search" className="field ps-9" placeholder={t.find} value={query} onChange={(event) => setQuery(event.target.value)}/>
    </label>
    <fieldset>
      <legend className="text-sm font-bold">{t.coordinator}</legend>
      {!shown.length ? <p className="mt-2 text-sm text-ink-500">{t.noMatch}</p> :
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {shown.map((person) => <li key={person.subject}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="transfer-assignee" className="h-4 w-4 accent-brand-600" value={person.subject} checked={assignee === person.subject} onChange={() => setAssignee(person.subject)} required/>
              <span className="min-w-0 flex-1 font-semibold text-ink-800"><bdi>{person.name}</bdi>{person.subject === mySubject ? ` ${t.you}` : ""}</span>
              {person.role === "COORDINATOR_LEAD" && <span className="text-xs text-ink-500">{t.lead}</span>}
            </label>
          </li>)}
        </ul>}
    </fieldset>
    <label className="block text-sm font-bold">{t.reason}
      <textarea className="field mt-2 min-h-24" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t.placeholder} aria-describedby="transfer-reason-hint"/>
      <span id="transfer-reason-hint" className="mt-1 block text-xs font-normal text-ink-500">{t.reasonHint}</span>
    </label>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>{t.cancel}</button>
      <button className="btn-primary" disabled={!assignee || !reason.trim()}>{t.next}</button>
    </div>
  </form>;
}

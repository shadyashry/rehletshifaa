"use client";

import type { ReactNode } from "react";
import { Check, FileText, MessageSquareText, UserRound } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import type { CaseActions } from "@/components/portal/CurrentAction";
/** The backend's one answer to "may the patient see a proposal, and which one" — rendered, never re-derived from the stage. */
export type PatientProposalState = { state: string; action?: "REVIEW_PROPOSAL" | "VIEW_PROPOSAL" | null; versionId?: string | null; versionNumber?: number | null; validUntil?: string | null; decidedAt?: string | null };

/**
 * The patient's care journey, case-centric: what is happening now, whether they must do anything, what
 * happens next, and the people and money facts that support it — nothing more. Every state on this page
 * is rendered from the backend's resolution (current action, patient proposal, deposit); the page never
 * derives an action from the stage, the proposal or the deposit on its own, and it offers at most one
 * primary action at a time.
 */
export type CaseSummary = {
  id: string; caseNumber: string; status: string; careCategory?: string; coordinatorName?: string | null;
  doctorName?: string | null; waitingOn?: string | null; updatedAt: string; createdAt?: string;
};
export type PatientActionItem = { id: string; kind: string; code: string; label: string; required: boolean; completed: boolean };
export type PatientAction = { taskId: string; title: string; message?: string | null; blocking: boolean; dueAt?: string | null; items: PatientActionItem[] };
export type ProposalSummaryData = { versionNumber: number; status: string; currency: string; documentType?: string; validUntil?: string; items: { quantity: number; unitPrice: number; optional: boolean }[] };
export type DepositSummaryData = { status: string; currency: string; totalDisplay?: number | null; paidDisplay?: number | null; balanceDisplay?: number | null };
export type CaseDocument = { documentId: string; fileName: string; status: string; createdAt: string };
export type CareView = "care" | "documents" | "messages";

export function MyCare({ locale, caseSummary, actions, patientAction, patientProposal, proposal, deposit, documents, unreadMessages, timeline, otherCases, view, onView, onOpenCase, onOpenProposal, identityStep, messagesPanel }: {
  locale: Locale; caseSummary: CaseSummary; actions: CaseActions; patientAction?: PatientAction | null; patientProposal?: PatientProposalState | null;
  proposal?: ProposalSummaryData | null; deposit?: DepositSummaryData | null; documents: CaseDocument[]; unreadMessages: number;
  timeline: { status: string; occurredAt: string }[]; otherCases: CaseSummary[]; view: CareView; onView: (view: CareView) => void;
  onOpenCase: (id: string) => void; onOpenProposal: () => void; identityStep?: ReactNode; messagesPanel: ReactNode;
}) {
  const ar = locale === "ar";
  const t = copy(ar);
  const c = caseSummary;
  const code = actions.currentAction.code;
  const step = stepCopy(code, ar, { patientAction, proposalState: patientProposal?.state ?? null, status: c.status });
  const phase = phaseIndex(c.status);
  const canMessage = actions.availableActions.includes("MESSAGE_COORDINATOR");
  const money = (n: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const proposalTotal = proposal ? proposal.items.filter(i => !i.optional).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) : null;
  const showProposal = !!patientProposal && ["READY", "ACCEPTED", "DECLINED", "EXPIRED"].includes(patientProposal.state) && !!proposal;
  const showDeposit = !!deposit && deposit.status !== "CANCELLED";

  return (
    <div className="mx-auto max-w-[77.5rem]">
      {/* Small screens: the same three destinations the header carries on wider ones. */}
      <nav aria-label={t.navLabel} className="mb-4 flex gap-1 border-b border-line-strong md:hidden">
        {(["care", "documents", "messages"] as const).map(id => (
          <button key={id} type="button" aria-current={view === id ? "page" : undefined}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-[0.9rem] font-bold transition ${view === id ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}
                  onClick={() => onView(id)}>
            {t.nav[id]}{id === "messages" && unreadMessages > 0 && <span className="ms-1.5 rounded-full bg-brand-600 px-1.5 text-[0.7rem] text-white">{unreadMessages}</span>}
          </button>
        ))}
      </nav>

      {/* Case header: who and what, compactly — no identifiers beyond the reference the patient already knows. */}
      <header id="case-heading" tabIndex={-1} className="card px-5 py-4 outline-none sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[0.95rem] font-bold text-brand-700" dir="ltr">{c.caseNumber}</span>
          {c.careCategory && <><span aria-hidden className="text-ink-300">·</span><span className="text-[0.95rem] text-ink-700">{careArea(c.careCategory, locale)}</span></>}
          <span className="ms-auto rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[0.75rem] font-bold text-brand-800">{t.phases[phase]}</span>
        </div>
        <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[0.9rem]">
          <div className="flex items-baseline gap-1.5"><dt className="text-ink-500">{t.coordinator}</dt><dd className="font-semibold text-ink-900">{c.coordinatorName ?? t.notAssigned}</dd></div>
          {c.doctorName && <div className="flex items-baseline gap-1.5"><dt className="text-ink-500">{t.consultant}</dt><dd className="font-semibold text-ink-900">{c.doctorName}</dd></div>}
        </dl>
      </header>

      {view === "documents" && (
        <section aria-labelledby="documents-title" className="card mt-5 p-5 sm:p-6">
          <h2 id="documents-title" className="text-[1.05rem] font-bold text-brand-900">{t.documentsTitle}</h2>
          <p className="mt-1 text-[0.9rem] text-ink-600">{t.documentsHint}</p>
          {documents.length === 0 ? <p className="mt-4 text-[0.95rem] text-ink-500">{t.noDocuments}</p>
            : <ul className="mt-4 divide-y divide-line">
                {documents.map(doc => (
                  <li key={doc.documentId} className="flex items-center gap-3 py-3">
                    <FileText size={17} aria-hidden className="flex-none text-brand-600"/>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink-800">{doc.fileName}</span>
                    <span className="text-[0.8rem] text-ink-500">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(doc.createdAt))}</span>
                  </li>
                ))}
              </ul>}
        </section>
      )}

      {view === "messages" && <div className="mt-5">{messagesPanel}</div>}

      {view === "care" && (
        <div className="mt-5 flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start lg:gap-x-6 lg:gap-y-5">
          {/* CURRENT STEP — the strongest element on the page. */}
          <section aria-labelledby="current-step-title" className="rounded-xl border border-brand-200 bg-brand-50 p-5 sm:p-6 lg:col-start-1 lg:row-start-1">
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-brand-700">{t.currentStep}</p>
            <h2 id="current-step-title" className="mt-1.5 text-[1.35rem] font-bold leading-8 text-brand-900 sm:text-[1.5rem]">{step.title}</h2>
            <p className="mt-2 max-w-2xl text-[0.98rem] leading-7 text-ink-700">{step.body}</p>

            {code === "PROVIDE_INFORMATION" && patientAction && patientAction.items.length > 0 && (
              <ul className="mt-3 space-y-1.5" aria-label={t.requested}>
                {patientAction.items.map(item => (
                  <li key={item.id} className="flex items-center gap-2 text-[0.92rem] text-ink-800">
                    <span aria-hidden className={`grid h-5 w-5 flex-none place-items-center rounded-full ${item.completed ? "bg-brand-600 text-white" : "border border-brand-300 bg-white"}`}>{item.completed && <Check size={12} strokeWidth={3}/>}</span>
                    <span className={item.completed ? "text-ink-500 line-through" : ""}>{item.label}</span>
                    {item.completed && <span className="sr-only">({t.provided})</span>}
                  </li>
                ))}
              </ul>
            )}
            {code === "COMPLETE_PROFILE" && actions.blockers.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 ps-5 text-[0.92rem] text-ink-800">
                {actions.blockers.map(b => <li key={b.code}>{ar ? b.labelAr : b.labelEn}</li>)}
              </ul>
            )}

            {/* Exactly one primary action, and only when the backend says the patient owes something. */}
            {actions.currentAction.kind === "FOCUS" && code === "REVIEW_PROPOSAL" && (
              <button type="button" className="btn-primary mt-5" onClick={onOpenProposal}>{t.reviewProposal}</button>
            )}
            {actions.currentAction.kind === "FOCUS" && code === "PROVIDE_INFORMATION" && (
              <button type="button" className="btn-primary mt-5" onClick={() => onView("messages")}>{t.replyInMessages}</button>
            )}
            {code === "VERIFY_IDENTITY" && identityStep && <div className="mt-5">{identityStep}</div>}

            {actions.currentAction.kind !== "FOCUS" && (
              <p className="mt-4 flex items-center gap-2 text-[0.95rem] font-semibold text-brand-800" role="status">
                <Check size={16} strokeWidth={3} aria-hidden className="flex-none"/>{t.noAction}
              </p>
            )}
            {step.next && (
              <p className="mt-4 border-t border-brand-200 pt-3 text-[0.9rem] leading-6 text-ink-600">
                <span className="font-bold text-ink-800">{t.next}:</span> {step.next}
              </p>
            )}
          </section>

          {/* DEPOSIT — the one place the amount lives. Truthful to the offline model: arranged by our side. */}
          {showDeposit && deposit && (
            <section aria-labelledby="deposit-title" className={`rounded-xl border p-5 lg:col-start-2 lg:row-start-1 ${deposit.status === "PAID" ? "border-brand-200 bg-white" : "border-sand-200 bg-sand-50"}`}>
              <p id="deposit-title" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.deposit}</p>
              <p className="mt-1.5 text-[1.5rem] font-bold leading-8 text-brand-900" dir="ltr">{deposit.totalDisplay != null ? money(deposit.totalDisplay, deposit.currency) : "—"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-[0.92rem] font-semibold text-ink-800">
                {deposit.status === "PAID" && <Check size={15} strokeWidth={3} aria-hidden className="text-brand-700"/>}
                {t.depositStatus[deposit.status] ?? deposit.status}
              </p>
              {deposit.status === "PARTIALLY_PAID" && deposit.paidDisplay != null && (
                <p className="mt-1 text-[0.85rem] text-ink-600">{t.received} <span dir="ltr">{money(deposit.paidDisplay, deposit.currency)}</span></p>
              )}
              <p className="mt-2 text-[0.85rem] leading-6 text-ink-600">{t.depositNote[deposit.status] ?? ""}</p>
              {/* Reserved for an online step: rendered only when the backend resolves PAY_DEPOSIT, which it does not today. */}
              {code === "PAY_DEPOSIT" && <button type="button" className="btn-primary mt-4 w-full">{t.payDeposit}</button>}
            </section>
          )}

          {/* JOURNEY — orientation only; nothing here is a control. */}
          <section aria-label={t.journey} className="card p-4 sm:p-5 lg:col-start-1 lg:row-start-2">
            <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-0">
              {t.phases.map((label, index) => {
                const done = index < phase, now = index === phase;
                return (
                  <li key={label} className="flex items-start gap-2.5 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:text-center" aria-current={now ? "step" : undefined}>
                    <span aria-hidden className="relative flex h-5 w-5 flex-none items-center justify-center sm:w-full">
                      <span className="absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-line sm:block"/>
                      <span className={`relative z-10 grid h-5 w-5 place-items-center rounded-full ${done ? "bg-brand-100 text-brand-700" : now ? "bg-brand-600 text-white" : "border border-line-strong bg-white"}`}>
                        {done ? <Check size={11} strokeWidth={3}/> : now ? <span className="h-1.5 w-1.5 rounded-full bg-white"/> : null}
                      </span>
                    </span>
                    <span className={`text-[0.8rem] leading-5 ${now ? "font-bold text-brand-900" : done ? "font-medium text-ink-600" : "font-medium text-ink-400"}`}>
                      {label}{done && <span className="sr-only"> ({t.done})</span>}{now && <span className="sr-only"> ({t.current})</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* PROPOSAL — a summary and one action; the document itself opens on demand. */}
          {showProposal && proposal && patientProposal && (
            <section aria-labelledby="proposal-title" className="card p-5 lg:col-start-1 lg:row-start-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p id="proposal-title" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.proposal}</p>
                  {proposalTotal != null && <p className="mt-1.5 text-[1.5rem] font-bold leading-8 text-brand-900" dir="ltr">{money(proposalTotal, proposal.currency)}</p>}
                  <p className="mt-1 text-[0.92rem] font-semibold text-ink-800">{t.proposalStatus[patientProposal.state] ?? patientProposal.state}<span className="font-normal text-ink-500"> · {t.version} {proposal.versionNumber}</span></p>
                </div>
                {/* One control for one outcome: reviewing is already the current step's action, so only the settled document gets a link here. */}
                {patientProposal.action === "VIEW_PROPOSAL" && (
                  <button type="button" className="link-cta text-[0.92rem]" onClick={onOpenProposal}>{t.viewProposal} <span aria-hidden>{ar ? "←" : "→"}</span></button>
                )}
              </div>
            </section>
          )}

          {/* COORDINATOR — the human contact, compact, with the one supported communication action. */}
          <section aria-labelledby="coordinator-title" className="card p-5 lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:self-start">
            <p id="coordinator-title" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.yourCoordinator}</p>
            <div className="mt-2 flex items-center gap-3">
              <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-full bg-brand-100 text-brand-700"><UserRound size={20}/></span>
              <div className="min-w-0">
                <p className="truncate text-[1rem] font-bold text-brand-900">{c.coordinatorName ?? t.notAssigned}</p>
                <p className="text-[0.85rem] leading-5 text-ink-600">{c.coordinatorName ? t.coordinatorHint : t.coordinatorPending}</p>
              </div>
            </div>
            {canMessage && (
              <button type="button" className="btn-secondary mt-4 w-full justify-center gap-2" onClick={() => onView("messages")}>
                <MessageSquareText size={16} aria-hidden/>{t.message}{unreadMessages > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[0.7rem] text-white">{unreadMessages}</span>}
              </button>
            )}
          </section>

          {otherCases.length > 0 && (
            <section aria-labelledby="other-cases-title" className="lg:col-start-1 lg:row-start-4">
              <h2 id="other-cases-title" className="text-[0.72rem] font-bold uppercase tracking-[0.1em] text-ink-500">{t.otherCases}</h2>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-white">
                {otherCases.map(other => (
                  <li key={other.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start hover:bg-mist/70" onClick={() => onOpenCase(other.id)}>
                      <span><span className="font-semibold text-brand-700" dir="ltr">{other.caseNumber}</span>{other.careCategory && <span className="text-ink-600"> · {careArea(other.careCategory, locale)}</span>}</span>
                      <span className="text-[0.8rem] text-ink-500">{t.phases[phaseIndex(other.status)]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {timeline.length === 0 && null}
    </div>
  );
}

// ---------- copy ----------

function copy(ar: boolean) {
  return ar ? {
    navLabel: "رعايتي", nav: { care: "رعايتي", documents: "المستندات", messages: "الرسائل" },
    coordinator: "المنسق", consultant: "الاستشاري", notAssigned: "لم يُسند بعد",
    currentStep: "الخطوة الحالية", next: "الخطوة التالية", noAction: "لا يلزم منك أي إجراء الآن.",
    reviewProposal: "مراجعة العرض", replyInMessages: "الرد في الرسائل", requested: "المطلوب منك", provided: "تم تقديمه",
    deposit: "الوديعة", received: "المستلم", payDeposit: "دفع الوديعة بأمان",
    depositStatus: { REQUESTED: "قيد الترتيب", PARTIALLY_PAID: "استُلم جزئيًا", PAID: "تم استلام الوديعة", WAIVED: "معفاة", REFUNDED: "مستردة", CANCELLED: "ملغاة" } as Record<string, string>,
    depositNote: { REQUESTED: "سيرسل لك منسقك تعليمات الدفع.", PARTIALLY_PAID: "سيؤكد منسقك المبلغ المتبقي.", PAID: "شكرًا لك — تُحتسب من رصيدك النهائي.", WAIVED: "لا يلزم دفع وديعة لهذه الحالة.", REFUNDED: "أُعيدت الوديعة إليك." } as Record<string, string>,
    journey: "مسار رعايتك", done: "مكتمل", current: "الحالية",
    phases: ["استلمنا حالتك", "مراجعة المنسق", "مراجعة الاستشاري", "عرضك", "الوديعة", "العلاج", "المتابعة"],
    proposal: "عرضك", version: "الإصدار", viewProposal: "عرض العرض",
    proposalStatus: { READY: "جاهز للمراجعة", ACCEPTED: "تم الإقرار به", DECLINED: "مرفوض", EXPIRED: "منتهي الصلاحية" } as Record<string, string>,
    yourCoordinator: "منسقك", coordinatorHint: "جهة تواصلك طوال رحلة رعايتك.", coordinatorPending: "سيُعرّفك منسقك بنفسه قريبًا.", message: "مراسلة",
    documentsTitle: "المستندات التي شاركتها", documentsHint: "المستندات المرفقة بهذه الحالة. لإضافة مستند، استخدم الرابط الآمن الذي يرسله لك منسقك.", noDocuments: "لم تشارك أي مستندات بعد.",
    otherCases: "حالاتك الأخرى",
  } : {
    navLabel: "My Care", nav: { care: "My Care", documents: "Documents", messages: "Messages" },
    coordinator: "Coordinator", consultant: "Consultant", notAssigned: "Not assigned yet",
    currentStep: "Current step", next: "Next", noAction: "No action is required from you right now.",
    reviewProposal: "Review proposal", replyInMessages: "Reply in Messages", requested: "What we need from you", provided: "provided",
    deposit: "Deposit", received: "Received", payDeposit: "Pay deposit securely",
    depositStatus: { REQUESTED: "Arranging", PARTIALLY_PAID: "Partly received", PAID: "Deposit received", WAIVED: "Waived", REFUNDED: "Refunded", CANCELLED: "Cancelled" } as Record<string, string>,
    depositNote: { REQUESTED: "Your coordinator will send you the payment instructions.", PARTIALLY_PAID: "Your coordinator will confirm the remaining amount.", PAID: "Thank you — credited to your final balance.", WAIVED: "No deposit is needed for your case.", REFUNDED: "The deposit has been returned to you." } as Record<string, string>,
    journey: "Your care journey", done: "done", current: "current",
    phases: ["Case received", "Coordinator review", "Consultant review", "Your proposal", "Deposit", "Treatment", "Follow-up"],
    proposal: "Your proposal", version: "Version", viewProposal: "View proposal",
    proposalStatus: { READY: "Ready to review", ACCEPTED: "Acknowledged", DECLINED: "Declined", EXPIRED: "Expired" } as Record<string, string>,
    yourCoordinator: "Your coordinator", coordinatorHint: "Your point of contact throughout your care journey.", coordinatorPending: "Your coordinator will introduce themselves shortly.", message: "Message",
    documentsTitle: "Documents you shared", documentsHint: "The documents attached to this case. To add one, use the secure link your coordinator sends you.", noDocuments: "You have not shared any documents yet.",
    otherCases: "Your other cases",
  };
}

/**
 * The current step in the patient's words, keyed by the backend's action code. Copy only — which code
 * applies is never decided here.
 */
function stepCopy(code: string, ar: boolean, ctx: { patientAction?: PatientAction | null; proposalState: string | null; status: string }) {
  const pick = (en: [string, string, string?], arr: [string, string, string?]) => { const [title, body, next] = ar ? arr : en; return { title, body, next }; };
  switch (code) {
    case "PROVIDE_INFORMATION": return {
      title: ar ? "نحتاج منك معلومة" : "We need something from you",
      body: ctx.patientAction?.message?.trim() || (ar ? "طلب منسقك معلومة أو مستندًا لمتابعة حالتك." : "Your coordinator has asked for information or a document so your case can continue."),
      next: ar ? "أرسل ردك هنا، أو استخدم الرابط الآمن الذي وصلك لرفع المستندات. بعدها يراجعه منسقك ويكمل." : "Reply here, or use the secure link we sent you to upload documents. Your coordinator then reviews it and continues.",
    };
    case "REVIEW_PROPOSAL": return pick(
      ["Your proposal is ready to review", "Your treatment plan and its estimated cost are ready. Take the time you need — nothing happens until you decide.", "If you accept, we start arranging your care."],
      ["عرضك جاهز للمراجعة", "خطة علاجك وتكلفتها التقديرية جاهزة. خذ وقتك — لن يحدث شيء قبل أن تقرر.", "إذا وافقت، نبدأ ترتيب رعايتك."]);
    case "COMPLETE_PROFILE": return pick(
      ["A few details are still needed", "Before we can arrange your care, the steps below need to be completed. Use the secure link we sent you, or message your coordinator.", "Once they are done, your coordinator continues."],
      ["ما زالت بعض البيانات مطلوبة", "قبل أن نرتب رعايتك، يلزم إكمال الخطوات أدناه. استخدم الرابط الآمن الذي أرسلناه لك، أو راسل منسقك.", "فور اكتمالها، يتابع منسقك."]);
    case "VERIFY_IDENTITY": return pick(
      ["Identity verification", "Because travel support is part of your care, we need to verify your identity before arrangements are confirmed. Only the minimum is stored, encrypted.", "Our team reviews it and your coordinator continues."],
      ["التحقق من الهوية", "لأن دعم السفر جزء من رعايتك، نحتاج إلى التحقق من هويتك قبل تأكيد الترتيبات. نُخزّن الحد الأدنى فقط ومشفّرًا.", "يراجعه فريقنا ويتابع منسقك."]);
    case "WAIT_COORDINATOR_REVIEW": return ctx.status === "RECEIVED" ? pick(
      ["We have your case", "Your case has been received and is waiting for a coordinator to look at it.", "A coordinator will check what you sent and tell you if anything is missing."],
      ["استلمنا حالتك", "تم استلام حالتك وهي بانتظار مراجعة أحد المنسقين.", "سيتحقق المنسق مما أرسلته ويخبرك إن كان ينقص شيء."]) : pick(
      ["Your coordinator is reviewing your case", "Your coordinator is going through what you sent and preparing it for a Consultant.", "Your case will be sent to a Consultant in the right specialty."],
      ["منسقك يراجع حالتك", "يطّلع منسقك على ما أرسلته ويجهّزه لعرضه على استشاري.", "ستُرسل حالتك إلى استشاري في التخصص المناسب."]);
    case "WAIT_CONSULTANT_REVIEW": return pick(
      ["A Consultant is reviewing your case", "A Consultant is going through your reports and history now.", "You will receive a recommendation and an initial cost estimate."],
      ["استشاري يراجع حالتك", "يطّلع الاستشاري الآن على تقاريرك وتاريخك الطبي.", "ستصلك التوصية مع تقدير أولي للتكلفة."]);
    case "WAIT_PROPOSAL": return ctx.proposalState === "REVISION_REQUESTED" ? pick(
      ["We are preparing a revised proposal", "Your coordinator is updating the proposal with the changes you asked for.", "You will receive a new secure link to review it."],
      ["نجهّز عرضًا معدّلًا", "يحدّث منسقك العرض بالتعديلات التي طلبتها.", "ستصلك رابط آمن جديد لمراجعته."]) : ctx.proposalState === "EXPIRED" ? pick(
      ["We are preparing an updated proposal", "Your previous estimate expired. Your coordinator is preparing an updated one.", "You will receive a new secure link to review it."],
      ["نجهّز عرضًا محدّثًا", "انتهت صلاحية تقديرك السابق، ويجهّز منسقك عرضًا محدّثًا.", "ستصلك رابط آمن جديد لمراجعته."]) : pick(
      ["We are preparing your proposal", "Your coordinator is putting together the treatment plan and its estimated cost.", "You will receive the proposal to review in your own time."],
      ["نجهّز عرضك", "يجمع منسقك خطة العلاج وتكلفتها التقديرية.", "ستصلك خطة العلاج لتراجعها في وقتك."]);
    case "WAIT_DEPOSIT_ARRANGEMENT": return pick(
      ["Deposit arrangements", "Your proposal has been accepted. We are arranging the coordination deposit details and will send you the payment instructions.", "Once the deposit is confirmed, your coordinator starts arranging your treatment."],
      ["ترتيبات الوديعة", "تم قبول عرضك. نرتّب تفاصيل وديعة التنسيق وسنرسل لك تعليمات الدفع.", "بعد تأكيد الوديعة، يبدأ منسقك ترتيب علاجك."]);
    case "WAIT_COORDINATION": return pick(
      ["We are arranging your treatment", "Your coordinator is organising your appointments and, where agreed, the practical side of your trip.", "You will receive your dates and arrival details."],
      ["نرتّب علاجك", "ينظّم منسقك مواعيدك، وحيثما اتُّفق، الجوانب العملية لرحلتك.", "ستصلك المواعيد وتفاصيل الوصول."]);
    case "WAIT_TREATMENT": return pick(
      ["Your arrival is confirmed", "Everything is set for your arrival.", "Your treatment begins as planned."],
      ["تم تأكيد وصولك", "كل شيء جاهز لوصولك.", "يبدأ علاجك حسب الخطة."]);
    case "IN_TREATMENT": return pick(
      ["Your treatment is under way", "Your care team is with you throughout your treatment.", "After discharge we stay in contact for follow-up."],
      ["علاجك جارٍ", "فريق الرعاية معك طوال فترة العلاج.", "بعد الخروج نبقى على تواصل للمتابعة."]);
    case "FOLLOW_UP": return pick(
      ["You are in follow-up", "Your treatment is complete and we stay in contact while you recover."],
      ["أنت في مرحلة المتابعة", "اكتمل علاجك ونبقى على تواصل معك أثناء تعافيك."]);
    default: {
      if (ctx.status === "DECLINED") return pick(["You declined the proposal", "Your case is closed for now. Your coordinator remains available if anything changes."], ["لم توافق على العرض", "حالتك مغلقة حاليًا. يبقى منسقك متاحًا إن تغيّر شيء."]);
      if (ctx.status === "CLINICALLY_NOT_SUITABLE") return pick(["This case is not clinically suitable for treatment with us", "The Consultant reviewed your case and advised against treatment here. Your coordinator can explain what this means."], ["هذه الحالة غير مناسبة سريريًا للعلاج لدينا", "راجع الاستشاري حالتك ولم ينصح بالعلاج لدينا. يمكن لمنسقك أن يشرح لك ما يعنيه ذلك."]);
      if (ctx.status === "CLOSED" || ctx.status === "CANCELLED") return pick(["This case is closed", "If you would like to look at your options again, contact your coordinator."], ["هذه الحالة مغلقة", "إذا رغبت في مراجعة خياراتك مجددًا، تواصل مع منسقك."]);
      return pick(["You're all set for now", "Our team is handling the next step and will keep you updated."], ["كل شيء على ما يرام الآن", "فريقنا يتولى الخطوة التالية وسيوافيك بالمستجدات."]);
    }
  }
}

/** Patient-facing phases; internal statuses are mapped into them and never shown. */
const PHASES = [
  ["DRAFT", "RECEIVED"], ["INTAKE_REVIEW", "INFORMATION_REQUIRED", "READY_FOR_CONSULTANT"],
  ["CONSULTANT_ASSIGNMENT_PENDING", "CONSULTANT_REVIEW", "CLINICAL_RECOMMENDATION_READY", "CLINICALLY_NOT_SUITABLE"],
  ["PROPOSAL_PREPARATION", "PROPOSAL_INTERNAL_APPROVAL", "REVISION_REQUESTED", "PATIENT_DECISION", "DECLINED", "EXPIRED"],
  ["ACCEPTED"], ["TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "TREATMENT_IN_PROGRESS"], ["DISCHARGED", "FOLLOW_UP", "CLOSED", "CANCELLED"],
];
export function phaseIndex(status: string) { const found = PHASES.findIndex(group => group.includes(status)); return found < 0 ? 0 : found; }

function careArea(value: string, locale: Locale) {
  const map: Record<string, { en: string; ar: string }> = {
    cardiology: { en: "Cardiology", ar: "أمراض القلب" }, orthopedics: { en: "Orthopedics", ar: "جراحة العظام" },
    "rheumatology-rehabilitation": { en: "Rehabilitation & rheumatology", ar: "التأهيل والروماتيزم" },
  };
  const entry = map[value];
  return entry ? (locale === "ar" ? entry.ar : entry.en) : value.replaceAll("-", " ");
}

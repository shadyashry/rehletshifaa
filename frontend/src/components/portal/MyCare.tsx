"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Check, FileText, MessageCircle, MessageSquareText, Plus, UserRound } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { EmergencyGuidance } from "@/components/EmergencyGuidance";
import { CaseJourney } from "@/components/CaseJourney";
import { CaseStamp, stampDate } from "@/components/brand/CaseStamp";
import { DossierPage } from "@/components/brand/DossierPage";
import { CaseFileStack, type FileSheet } from "@/components/portal/CaseFileStack";
import { PaidBar, PaymentReceipt, PaymentTrack, paymentStep } from "@/components/portal/DepositVisuals";
import { EstimateRangeBar } from "@/components/EstimateRangeBar";
import { careViewHref, isPlainClick } from "@/components/portal/care-view";
import { careAreaLabel, fillTemplate, plural } from "@/lib/portal-labels";
import { ConfirmDialog, UnreadCount } from "@/components/portal/portal-ui";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { CareAreaMark, CaseSwitcher, phaseIndex, takeArrivalFocus } from "@/components/portal/CaseSwitcher";
import { formatMoney } from "@/lib/money";
import type { CaseActions } from "@/components/portal/CurrentAction";
import { patientStepText, type StepText } from "@/components/portal/patient-step";
import { isGuardianStep } from "@/lib/guardian";
import { ADMISSION_STEPS, DISCHARGE_STEPS, FOLLOW_UP_STEPS, TREATMENT_STEPS } from "@/components/portal/admission-steps";
/** The backend's one answer to "may the patient see a proposal, and which one" — rendered, never re-derived from the stage. */
export type PatientProposalState = { state: string; action?: "REVIEW_PROPOSAL" | "VIEW_PROPOSAL" | null; versionId?: string | null; versionNumber?: number | null; validUntil?: string | null; decidedAt?: string | null; releasedAt?: string | null;
  /** PRELIMINARY_ESTIMATE or FINAL_TREATMENT_QUOTE: which noun the step uses (one noun per document). */
  documentType?: string | null };
/**
 * D-1: when the three stamped moments happened, from the case's status history (patient-safe; staff get none). Each is
 * an ISO instant or null; a page prints a stamp only from one of these, never from today.
 */
export type CaseMilestones = { receivedAt?: string | null; consultantReviewAt?: string | null; estimateReadyAt?: string | null };

/**
 * The patient's open file, case-centric: which case this is (and the others one tap away), what is happening now and
 * whether they must do anything, who looks after them, and the money facts that support it — nothing more. Every state
 * on this page is rendered from the backend's resolution (current action, patient proposal, deposit); the page never
 * derives an action from the stage, the proposal or the deposit on its own, and it offers at most one primary action.
 */
export type CaseSummary = {
  id: string; caseNumber: string; status: string; patientName?: string | null; careCategory?: string; coordinatorName?: string | null;
  doctorName?: string | null; waitingOn?: string | null; updatedAt: string; createdAt?: string;
  /** The account's relation to this case, from the backend's case list: its own case, or a relative's it represents. */
  viewer?: string | null;
};
export type PatientActionItem = { id: string; kind: string; code: string; label: string; required: boolean; completed: boolean };
export type PatientAction = { taskId: string; title: string; message?: string | null; blocking: boolean; dueAt?: string | null; items: PatientActionItem[] };
export type ProposalSummaryData = { versionNumber: number; status: string; currency: string; documentType?: string; validUntil?: string;
  /** category is the line's category as staff entered it (PLATFORM_FEE for the coordination and guarantee fee). */
  items: { quantity: number; unitPrice: number; optional: boolean; category?: string | null; description?: string | null }[];
  /** The patient's lowest, expected and highest totals in the proposal currency, as the proposal link shows them (UX 1c-0); null when unknown. */
  totalMin?: number | null; totalExpected?: number | null; totalMax?: number | null };
export type DepositSummaryData = { status: string; currency: string; totalDisplay?: number | null; paidDisplay?: number | null; balanceDisplay?: number | null;
  /** The latest bank-transfer reference the patient entered (DEP-3); decidedAt is set once Finance confirmed or rejected it. */
  transfer?: { reference: string; status: string; reason?: string | null; submittedAt?: string | null; decidedAt?: string | null } | null };
export type CaseDocument = { documentId: string; fileName: string; status: string; createdAt: string };
export type CareView = "care" | "documents" | "messages";

/** The steps whose subject is the deposit: its facts belong inside the current step, not in a second block. Paying it is the payment step's own panel. */
const MONEY_STEPS = new Set(["PAY_DEPOSIT", "WAIT_PAYMENT_CHECK"]);

export function MyCare({ locale, caseSummary, actions, milestones, patientAction, patientProposal, proposal, deposit, documents, unreadMessages, cases, view, onView, onOpenCase, onOpenProposal, identityStep, guardianStep, paymentStep, admissionStep, treatmentStep, dischargeStep, followUpStep, messagesPanel, concerns, documentUpload, newCaseHref = null, onWithdraw }: {
  locale: Locale; caseSummary: CaseSummary; actions: CaseActions; milestones?: CaseMilestones | null; patientAction?: PatientAction | null; patientProposal?: PatientProposalState | null;
  proposal?: ProposalSummaryData | null; deposit?: DepositSummaryData | null; documents: CaseDocument[]; unreadMessages: number;
  /** Every case the account can open, this one included; the switcher shows from two. */
  cases: CaseSummary[]; view: CareView; onView: (view: CareView) => void;
  onOpenCase: (id: string) => void; onOpenProposal: () => void; identityStep?: ReactNode;
  /** P1-13: the guardian's step (legal basis, evidence, consent), rendered when the backend's step is a guardian blocker. */
  guardianStep?: ReactNode;
  /** P1-13: "Raise a concern" and the patient's own concerns; one quiet line on the page. */
  concerns?: ReactNode;
  /** Adds a file to the case from the Documents tab; absent where the portal cannot upload. */
  documentUpload?: ReactNode;
  /** The deposit payment step (DEP-3), rendered when the backend says the patient owes it. */
  paymentStep?: ReactNode;
  /** P1-15: arrival, the voucher and the hospital balance, rendered when the backend's step is one of the admission steps. */
  admissionStep?: ReactNode;
  /** P1-16: the treatment timeline and, on REVIEW_CHANGE_ORDER, the change awaiting the patient's decision. */
  treatmentStep?: ReactNode;
  /** P1-17: going home (the medicines, warning signs, follow-up, return, documents and letter) and the statement, on GOING_HOME and FOLLOW_UP. */
  dischargeStep?: ReactNode;
  /** P1-18: the outcome questions on REPORT_OUTCOME, the next contact in FOLLOW_UP, and the closing statement once completed. */
  followUpStep?: ReactNode;
  messagesPanel: ReactNode;
  /** Where the account holder sends a new case of their own; null when it is not theirs to send from here. */
  newCaseHref?: string | null;
  /** Withdraws from the journey (P0-2); rendered as one quiet action only while the backend offers WITHDRAW. */
  onWithdraw?: () => Promise<unknown>;
}) {
  const work = useWorkCopy();
  const t = work.myCare;
  const c = caseSummary;
  const code = actions.currentAction.code;
  // P1-13: a guardian blocker is its own step in words (the backend still says COMPLETE_PROFILE; the blocker names which part).
  const guardianCode = code === "COMPLETE_PROFILE" && isGuardianStep(actions.currentAction.blockerCode) ? actions.currentAction.blockerCode : null;
  const guardianCopy = work.safety.guardian;
  // A final quote is reviewed as a quote, never called an estimate, and carries no estimate stamp.
  const finalQuote = patientProposal?.documentType === "FINAL_TREATMENT_QUOTE";
  const step: StepText = guardianCode
    ? (guardianCode === "GUARDIAN_EVIDENCE_MISSING" ? { title: guardianCopy.evidenceTitle, body: guardianCopy.evidenceBody } : { title: guardianCopy.stepTitle, body: guardianCopy.stepBody })
    : patientStepText(code, t.steps, { proposalState: patientProposal?.state ?? null, status: c.status, exit: actions.currentAction.exit ?? null, documentType: patientProposal?.documentType });
  const body = code === "PROVIDE_INFORMATION" ? patientAction?.message?.trim() || step.body : step.body;
  // A case closed or cancelled says nothing about how far it got, so its journey shows no step as reached or current.
  const phase = c.status === "CLOSED" || c.status === "CANCELLED" ? -1 : phaseIndex(c.status);
  // The account acts for the patient on this case (per case, from the backend), so the page says whose care this is.
  const representative = actions.viewer === "REPRESENTATIVE";
  const canMessage = actions.availableActions.includes("MESSAGE_COORDINATOR");
  // The patient's own way out, offered by the backend until travel is confirmed; a confirmation, then the one call.
  const canWithdraw = !!onWithdraw && actions.availableActions.includes("WITHDRAW");
  const [withdrawing, setWithdrawing] = useState(false);
  // A REJECTED row is an upload that never arrived (or did not match what was announced): there is no file to show.
  const shared = useMemo(() => documents.filter(doc => doc.status !== "REJECTED"), [documents]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const date = (iso: string) => dateFormat.format(new Date(iso));
  // The backend's expected total (UX 1c-0) when it sent one, else the sum of the lines that count (optional ones never do).
  const proposalTotal = proposal ? proposal.totalExpected ?? proposal.items.filter(i => !i.optional).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) : null;
  const showProposal = !!patientProposal && ["READY", "ACCEPTED", "DECLINED", "EXPIRED"].includes(patientProposal.state) && !!proposal;
  const showDeposit = !!deposit && deposit.status !== "CANCELLED";
  const depositInStep = showDeposit && MONEY_STEPS.has(code);
  const focus = actions.currentAction.kind === "FOCUS";
  const expectedDays = actions.currentAction.expectedWorkingDays ?? null;
  const showSwitcher = cases.length > 1;
  // A final quote's release is not the estimate's: only an estimate's release stands in for the estimate-ready date.
  const dated: CaseMilestones = { ...milestones, estimateReadyAt: milestones?.estimateReadyAt ?? (finalQuote ? null : patientProposal?.releasedAt) };
  const stamp = code === "REVIEW_PROPOSAL" && finalQuote ? null : stampFor(code, dated, t.stamp);
  // UX 1c-1: each dated moment the journey has reached is an earlier page of the file behind the current one (except
  // the moment the current page itself is stamped with), and its date sits under its journey step. No date, no sheet.
  const sheets: FileSheet[] = MOMENTS.flatMap(m => {
    const at = dated[m.key];
    return at && m.phase <= phase && m.key !== stamp?.key ? [{ key: m.key, title: t.journey.phases[m.phase], label: t.stamp[m.stamp], date: at }] : [];
  });
  const journeyDates = t.journey.phases.map((_, index) => {
    const moment = MOMENTS.find(m => m.phase === index);
    const at = moment ? dated[moment.key] : null;
    const text = at ? stampDate(at, locale) : null;
    return at && text ? { dateTime: at, text } : null;
  });

  // Arriving from the case switcher: the card that was pressed is gone, so the new case's heading takes focus.
  useEffect(() => { if (takeArrivalFocus(c.id)) document.getElementById("case-heading")?.focus(); }, [c.id]);

  return (
    <div className="mx-auto max-w-[75rem]">
      {/* Small screens: the same three destinations the header carries on wider ones. */}
      <nav aria-label={t.nav.label} className="mb-5 flex gap-1 border-b border-line-strong md:hidden">
        {(["care", "documents", "messages"] as const).map(id => (
          <a key={id} href={careViewHref(c.id, id)} aria-current={view === id ? "page" : undefined}
             className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 py-2.5 text-[0.9375rem] font-bold transition ${view === id ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}
             onClick={event => { if (!isPlainClick(event)) return; event.preventDefault(); onView(id); }}>
            {t.nav[id]}{id === "messages" && unreadMessages > 0 && <UnreadCount count={unreadMessages}/>}
          </a>
        ))}
      </nav>

      {showSwitcher && <CaseSwitcher cases={cases} currentId={c.id} phases={t.journey.phases} onOpenCase={onOpenCase} newCaseHref={newCaseHref}/>}

      {/* Case header: whose file this is and which case — no greeting, no identifiers beyond the reference they know. */}
      <header className="flex items-center gap-4 rounded-lg border border-line bg-white px-5 py-4 sm:px-6 sm:py-5">
        <CareAreaMark slug={c.careCategory} size="lg"/>
        <div className="min-w-0">
          {/* The case's heading, and where focus lands when the case or the view changes. */}
          <h2 id="case-heading" tabIndex={-1} className="headline scroll-mt-28 break-words rounded-sm text-brand-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
            {!c.patientName ? <bdi dir="ltr" className="whitespace-nowrap">{c.caseNumber}</bdi>
              : representative ? fillTemplate(work.patient.careFor, { name: `⁨${c.patientName}⁩` }) : <bdi>{c.patientName}</bdi>}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.9375rem] leading-6">
            {/* Without a name, the heading already is the case number. */}
            {c.patientName && <><span className="sr-only">{t.header.caseNumber}: </span>
            <bdi dir="ltr" className="font-semibold text-brand-700 tabular-nums whitespace-nowrap">{c.caseNumber}</bdi></>}
            {c.patientName && c.careCategory && <span aria-hidden className="text-ink-350">·</span>}
            {c.careCategory && <span className="text-ink-600">{careAreaLabel(c.careCategory, work.careAreas)}</span>}
          </p>
        </div>
      </header>

      {/* A-02: whatever stage the case is at, an emergency is local care now, never a message to the team. */}
      {view === "care" && <EmergencyGuidance variant="quiet" className="mt-5" title={t.emergency.title} body={t.emergency.body} more={t.emergency.more}/>}

      {view === "documents" && (
        <section aria-labelledby="documents-title" className="card mt-5 p-5 sm:p-6">
          <h2 id="documents-title" className="text-[1.0625rem] font-bold text-brand-900">{t.documents.title}</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-600">{t.documents.hint}</p>
          {documentUpload}
          {shared.length === 0 ? <p className="mt-4 text-[0.9375rem] text-ink-500">{t.documents.empty}</p>
            : <ul className="mt-4 divide-y divide-line">
                {shared.map(doc => {
                  // A file still being checked, or one the scanner condemned (it was deleted), says so; a clean one says nothing.
                  const state = doc.status === "CLEAN" ? null : doc.status === "SCAN_FAILED" ? t.documents.status.failed : t.documents.status.checking;
                  return (
                    <li key={doc.documentId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                      <FileText size={17} aria-hidden className="flex-none text-brand-600"/>
                      <span className={`min-w-0 flex-1 truncate font-semibold ${doc.status === "SCAN_FAILED" ? "text-ink-500" : "text-ink-800"}`} dir="auto">{doc.fileName}</span>
                      {state && <span className={`text-[0.8125rem] font-semibold ${doc.status === "SCAN_FAILED" ? "text-alert-800" : "text-ink-600"}`}>{state}</span>}
                      <span className="text-[0.8125rem] text-ink-500">{date(doc.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>}
        </section>
      )}

      {view === "messages" && <div className="mt-5">{messagesPanel}</div>}

      {view === "care" && (
        <div className="mt-5 flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start lg:gap-6">
          {/* CURRENT STEP — the page of the file that matters now: the petrol tab edge, one primary action or a clear "nothing
              needed", and the stamp when this step is one of the three moments and the backend recorded its date. */}
          <CaseFileStack sheets={sheets} locale={locale} label={t.file.earlier} pages={plural(locale, sheets.length + 1, work.plural.filePages)} className="lg:col-start-1 lg:row-start-1">
          <DossierPage edge="tab" aria-labelledby="current-step-title" className="my-care-step"
                       stamp={stamp ? <CaseStamp label={stamp.label} date={stamp.date} locale={locale}/> : null}>
            <p className="eyebrow">{t.step.eyebrow}</p>
            <h2 id="current-step-title" className="statement mt-2.5 text-brand-900">{step.title}</h2>
            <p className="mt-3 max-w-[65ch] text-ink-600" dir="auto">{body}</p>
            {/* P1-6 (D-02): how long the team usually takes, from the one SLA table, only while the team has the step. */}
            {!focus && expectedDays ? <p className="mt-2 text-[0.9375rem] text-ink-700">{fillTemplate(t.step.usuallyWithin, { duration: plural(locale, expectedDays, work.plural.workingDays) })}</p> : null}

            {code === "PROVIDE_INFORMATION" && patientAction && (c.coordinatorName || patientAction.dueAt) && (
              <p className="mt-2 text-[0.875rem] text-ink-600">
                {c.coordinatorName && <>{t.step.requestedBy} <bdi className="font-semibold text-ink-800">{c.coordinatorName}</bdi></>}
                {c.coordinatorName && patientAction.dueAt && " · "}
                {patientAction.dueAt && <>{t.step.replyBy} {date(patientAction.dueAt)}</>}
              </p>
            )}
            {code === "PROVIDE_INFORMATION" && patientAction && patientAction.items.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label={t.step.requested}>
                {patientAction.items.map(item => (
                  <li key={item.id} className="flex items-center gap-2.5 text-[0.9375rem] text-ink-800">
                    <span aria-hidden className={`grid h-5 w-5 flex-none place-items-center rounded-full ${item.completed ? "bg-brand-600 text-white" : "border border-ink-350 bg-white"}`}>{item.completed && <Check size={12} strokeWidth={3}/>}</span>
                    <span className={item.completed ? "text-ink-500 line-through" : ""} dir="auto">{item.label}</span>
                    {item.completed && <span className="sr-only">({t.step.provided})</span>}
                  </li>
                ))}
              </ul>
            )}
            {code === "COMPLETE_PROFILE" && guardianCode && guardianStep && <div className="mt-6">{guardianStep}</div>}
            {code === "COMPLETE_PROFILE" && !(guardianCode && guardianStep) && actions.blockers.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 ps-5 text-[0.9375rem] text-ink-800">
                {actions.blockers.map(b => <li key={b.code}>{locale === "ar" ? b.labelAr : b.labelEn}</li>)}
              </ul>
            )}

            {/* The money this step is about, inside the step: one place for the amount, on the facts panel. */}
            {depositInStep && deposit && !(code === "PAY_DEPOSIT" && paymentStep) && <DepositFacts deposit={deposit} locale={locale} level={3} className="mt-5 border-t border-line pt-4"/>}
            {code === "PAY_DEPOSIT" && focus && paymentStep}
            {/* P1-15: where and when, the voucher and what to pay at the hospital; on CONFIRM_ARRIVAL, the step's one action. */}
            {ADMISSION_STEPS.has(code) && admissionStep}
            {/* P1-16: what has happened in treatment; on REVIEW_CHANGE_ORDER, the change to decide is the step's one action. */}
            {TREATMENT_STEPS.has(code) && treatmentStep}
            {/* P1-18: the outcome questions (the step's one action), the next contact and who to turn to, or the closing statement. */}
            {(FOLLOW_UP_STEPS.has(code) || actions.currentAction.exit === "COMPLETED") && followUpStep}
            {/* P1-17: what to watch for, what to take and when the follow-up is; then the statement. Nothing to do here. */}
            {DISCHARGE_STEPS.has(code) && dischargeStep}

            {/* Exactly one primary action, and only when the backend says the patient owes something. */}
            {focus && code === "REVIEW_PROPOSAL" && (
              <button type="button" className="btn-primary mt-6" onClick={onOpenProposal}>{finalQuote ? t.step.reviewQuote : t.step.reviewProposal}</button>
            )}
            {focus && code === "PROVIDE_INFORMATION" && (
              <button type="button" className="btn-primary mt-6" onClick={() => onView("messages")}>{t.step.replyInMessages}</button>
            )}
            {code === "VERIFY_IDENTITY" && identityStep && <div className="mt-6">{identityStep}</div>}

            {!focus && (
              <p className="mt-5 flex items-center gap-2.5 text-[0.9375rem] font-semibold text-brand-800" role="status">
                <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-full bg-brand-100 text-brand-700"><Check size={14} strokeWidth={3}/></span>
                {t.step.noAction}
              </p>
            )}
            {step.next && (
              <div className="mt-5 border-t border-line pt-4 text-[0.9375rem] leading-7">
                <p className="font-semibold text-ink-800">{t.step.next}</p>
                <p className="text-ink-600">{step.next}</p>
              </div>
            )}
            {!focus && step.meanwhile && (
              <div className="mt-4 text-[0.9375rem] leading-7">
                <p className="font-semibold text-ink-800">{t.step.meanwhile}</p>
                <p className="text-ink-600">{step.meanwhile}</p>
              </div>
            )}
          </DossierPage>
          </CaseFileStack>

          {/* COORDINATOR — the relationship that is the product: near the top, a person, one way to reach them. */}
          <section aria-labelledby="coordinator-title" className="card p-5 sm:p-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
            <h2 id="coordinator-title" className="eyebrow">{t.people.title}</h2>
            <div className="mt-4 flex items-center gap-3.5">
              <Monogram name={c.coordinatorName} lead/>
              <div className="min-w-0">
                <p className="break-words text-[1.0625rem] font-semibold leading-6 text-brand-900">{c.coordinatorName ? <bdi>{c.coordinatorName}</bdi> : t.people.notAssigned}</p>
                <p className="text-[0.875rem] leading-6 text-ink-600">{c.coordinatorName ? t.people.coordinatorRole : t.people.pending}</p>
              </div>
            </div>
            {canMessage && (
              <button type="button" className="btn-secondary mt-5 w-full justify-center gap-2" onClick={() => onView("messages")}>
                <MessageSquareText size={16} aria-hidden/>{t.people.message}{unreadMessages > 0 && <UnreadCount count={unreadMessages}/>}
              </button>
            )}
            {c.coordinatorName && canMessage && (
              <p className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-5 text-ink-500">
                <MessageCircle size={15} aria-hidden className="mt-0.5 flex-none"/>{t.people.whatsapp}
              </p>
            )}
            {c.doctorName && (
              <div className="mt-5 flex items-center gap-3.5 border-t border-line pt-4">
                <Monogram name={c.doctorName}/>
                <div className="min-w-0">
                  <p className="text-[0.8125rem] leading-5 text-ink-500">{t.people.consultant}</p>
                  <p className="break-words font-semibold leading-6 text-ink-800"><bdi>{c.doctorName}</bdi></p>
                </div>
              </div>
            )}
          </section>

          {/* JOURNEY — orientation only; nothing here is a control. The markers fill as the case moves. */}
          <CaseJourney id="journey-title" title={t.journey.title} steps={t.journey.phases} current={phase} dates={journeyDates}
                       completedLabel={t.journey.done} currentLabel={t.journey.current} className="card p-5 sm:p-6 lg:col-start-1 lg:row-start-2"/>

          {/* ESTIMATE — the document's summary and, once settled, one way to open it. */}
          {showProposal && proposal && patientProposal && (
            <section aria-labelledby="proposal-title" className="card p-5 sm:p-6 lg:col-start-1 lg:row-start-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 id="proposal-title" className="eyebrow">{(t.estimate.documentType as Record<string, string>)[proposal.documentType ?? ""] ?? t.estimate.proposal}</h2>
                <StatusBadge tone={proposalTone(patientProposal.state)}>{(t.estimate.status as Record<string, string>)[patientProposal.state] ?? patientProposal.state}</StatusBadge>
              </div>
              {proposalTotal != null && <p className="statement mt-3 text-brand-900 tabular-nums"><bdi dir="ltr">{formatMoney(proposalTotal, proposal.currency, locale)}</bdi></p>}
              {proposal.versionNumber > 1 && <p className="mt-1 text-[0.875rem] text-ink-500">{t.estimate.updated}</p>}
              {/* UX 1c-2: the same scale as the proposal link. The deposit is not bracketed here: My Care states it once, in
                  its own facts (inside the step while it is the step's subject). */}
              {proposalTotal != null && (
                <EstimateRangeBar className="mt-4" items={proposal.items} expected={proposalTotal} min={proposal.totalMin} max={proposal.totalMax}
                                  kind={finalQuote ? "quote" : "estimate"}
                                  currency={proposal.currency} locale={locale} copy={t.estimate.bar}/>
              )}
              {/* While the deposit is being paid, the payment step already says this; it is said once. */}
              {proposal.documentType === "PRELIMINARY_ESTIMATE" && code !== "PAY_DEPOSIT" && <p className="mt-2 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.estimate.basis}</p>}
              {showDeposit && !depositInStep && deposit && <DepositFacts deposit={deposit} locale={locale} level={3} className="mt-5 border-t border-line pt-4"/>}
              {/* One control for one outcome: reviewing is already the current step's action, so only the settled document gets a link here. */}
              {patientProposal.action === "VIEW_PROPOSAL" && (
                <button type="button" className="link-cta mt-4 inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem]" onClick={onOpenProposal}>
                  {t.estimate.view}<ArrowRight size={16} aria-hidden className="rtl:-scale-x-100"/>
                </button>
              )}
            </section>
          )}
          {showDeposit && !depositInStep && !showProposal && deposit && (
            <DepositFacts deposit={deposit} locale={locale} level={2} className="card p-5 sm:p-6 lg:col-start-1 lg:row-start-3"/>
          )}

          {!showSwitcher && newCaseHref && (
            <p className="lg:col-start-1">
              <a href={newCaseHref} className="link-cta inline-flex min-h-11 items-center gap-2 text-[0.9375rem]"><Plus size={16} aria-hidden/>{t.cases.sendNew}</a>
            </p>
          )}

          {concerns && <div className="lg:col-start-1">{concerns}</div>}

          {/* WITHDRAW — one quiet way out, in words, away from the step's own action; never a second call to action. */}
          {canWithdraw && (
            <p className="text-[0.875rem] leading-6 text-ink-500 lg:col-start-1">
              {t.withdraw.lead}{" "}
              <button type="button" className="inline-flex min-h-11 items-center font-semibold text-ink-700 underline decoration-ink-350 underline-offset-4 hover:text-brand-800"
                      onClick={() => setWithdrawing(true)}>{t.withdraw.action}</button>
            </p>
          )}
          {withdrawing && (
            <ConfirmDialog title={t.withdraw.title} body={t.withdraw.body} confirm={t.withdraw.confirm} cancel={t.withdraw.cancel}
                           onConfirm={() => { setWithdrawing(false); void onWithdraw?.(); }} onCancel={() => setWithdrawing(false)}/>
          )}
        </div>
      )}
    </div>
  );
}

/** The deposit as authoritative money in a truthful, offline state: amount, status in words, and what happens next. */
function DepositFacts({ deposit, locale, level, className }: { deposit: DepositSummaryData; locale: Locale; level: 2 | 3; className: string }) {
  const { deposit: copy, stamp: stampCopy, journey } = useWorkCopy().myCare;
  const Heading = level === 2 ? "h2" : "h3";
  const status = copy.status as Record<string, string>, note = copy.note as Record<string, string>;
  const transfer = deposit.transfer;
  const checking = transfer?.status === "SUBMITTED", confirmed = transfer?.status === "CONFIRMED";
  // Partly received: the bar shows only what Finance confirmed; a reference being checked adds nothing to it.
  const paid = deposit.status === "PARTIALLY_PAID" && deposit.totalDisplay ? deposit.paidDisplay ?? null : null;
  // The track once the money is moving or done; a deposit merely due is the payment step's to draw.
  const tracked = deposit.status === "PAID" || checking || confirmed;
  return (
    <section aria-labelledby="deposit-title" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading id="deposit-title" className={level === 2 ? "eyebrow" : "label-micro text-ink-500"}>{copy.title}</Heading>
        <StatusBadge tone={depositTone(deposit.status)}>{(deposit.transfer?.status === "SUBMITTED" ? status.CHECKING : status[deposit.status]) ?? deposit.status}</StatusBadge>
      </div>
      <p className="statement mt-2 text-brand-900 tabular-nums"><bdi dir="ltr">{deposit.totalDisplay != null ? formatMoney(deposit.totalDisplay, deposit.currency, locale) : "—"}</bdi></p>
      {paid != null && deposit.totalDisplay ? <PaidBar paid={paid} total={deposit.totalDisplay} remaining={deposit.balanceDisplay} currency={deposit.currency} locale={locale} copy={copy} className="mt-3"/> : null}
      {tracked && <PaymentTrack steps={copy.track.steps} current={paymentStep(deposit.status, transfer?.status)} label={copy.track.label}
                                completedLabel={journey.done} currentLabel={journey.current} className="mt-5"/>}
      {transfer && (checking || confirmed) && (
        <PaymentReceipt title={copy.receipt} className="mt-4"
                        rows={[{ label: copy.sentReference, value: <bdi dir="ltr" translate="no">{transfer.reference}</bdi> }]}
                        stamp={checking ? { label: stampCopy.sent, date: transfer.submittedAt, locale } : { label: stampCopy.received, date: transfer.decidedAt, locale }}/>
      )}
      {!checking && note[deposit.status] && <p className="mt-3 text-[0.875rem] leading-6 text-ink-600">{note[deposit.status]}</p>}
    </section>
  );
}

/**
 * A person's initials on a circle: the coordinator's filled in Deep Petrol (the lead), anyone else's outlined. Titles
 * ("Dr", "د.") and the Arabic article are skipped so the initials are the name's own.
 */
function Monogram({ name, lead = false }: { name?: string | null; lead?: boolean }) {
  const letters = name ? initials(name) : "";
  const look = lead ? "h-12 w-12 bg-brand-700 text-white" : "h-10 w-10 border border-brand-300 bg-white text-brand-700";
  return (
    <span aria-hidden className={`grid flex-none place-items-center rounded-full text-[0.9375rem] font-semibold tracking-normal ${look}`}>
      {letters || <UserRound size={lead ? 20 : 18}/>}
    </span>
  );
}

const TITLES = /^(dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?|د\.?|أ\.د\.?|الدكتور|الدكتورة|الأستاذ|الأستاذة)$/i;
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(word => word && !TITLES.test(word));
  // Two Arabic letters side by side join into what reads as a word, so an Arabic name shows its first letter only.
  const arabic = /\p{Script=Arabic}/u.test(words[0] ?? "");
  const picked = words.length > 1 && !arabic ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  return picked.map(word => Array.from(word.length > 3 && word.startsWith("ال") ? word.slice(2) : word)[0] ?? "").join("").toLocaleUpperCase();
}

function proposalTone(state: string): StatusTone {
  return state === "ACCEPTED" ? "success" : state === "DECLINED" ? "danger" : state === "EXPIRED" ? "warning" : "info";
}
function depositTone(status: string): StatusTone {
  return status === "PAID" || status === "WAIVED" ? "success" : status === "REFUNDED" || status === "CANCELLED" ? "neutral" : "info";
}

/** The three moments the file dates (D-1): the journey step each belongs to and the word its stamp carries. */
const MOMENTS = [
  { key: "receivedAt", phase: 0, stamp: "received" },
  { key: "consultantReviewAt", phase: 2, stamp: "inReview" },
  { key: "estimateReadyAt", phase: 3, stamp: "estimateReady" },
] as const satisfies readonly { key: keyof CaseMilestones; phase: number; stamp: keyof LocalizedWorkCopy["myCare"]["stamp"] }[];

/** The step whose page carries a moment's stamp: case received (while it waits for the coordinator), in review, estimate ready. */
const STAMPED_BY: Record<string, keyof CaseMilestones> = { WAIT_COORDINATOR_REVIEW: "receivedAt", WAIT_CONSULTANT_REVIEW: "consultantReviewAt", REVIEW_PROPOSAL: "estimateReadyAt" };

/**
 * D-1: the stamp for the three moments the file records — case received (while it waits for the coordinator), specialist
 * reviewing, estimate ready — keyed by the backend's action code and printed only with the date the backend recorded.
 * No date, no stamp; every other step carries none.
 */
function stampFor(code: string, milestones: CaseMilestones | null | undefined, labels: LocalizedWorkCopy["myCare"]["stamp"]): { key: keyof CaseMilestones; label: string; date: string } | null {
  const moment = MOMENTS.find(m => m.key === STAMPED_BY[code]);
  const date = moment ? milestones?.[moment.key] : null;
  return moment && date ? { key: moment.key, label: labels[moment.stamp], date } : null;
}

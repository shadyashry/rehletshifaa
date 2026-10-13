"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { ArrowRight, Check, FileText, MessageCircle, MessageSquareText, Plus, UserRound } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { careAreaLabel, fillTemplate } from "@/lib/portal-labels";
import { UnreadCount } from "@/components/portal/portal-ui";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { CareAreaMark, CaseSwitcher, phaseIndex, takeArrivalFocus } from "@/components/portal/CaseSwitcher";
import { formatMoney } from "@/lib/money";
import type { CaseActions } from "@/components/portal/CurrentAction";
/** The backend's one answer to "may the patient see a proposal, and which one" — rendered, never re-derived from the stage. */
export type PatientProposalState = { state: string; action?: "REVIEW_PROPOSAL" | "VIEW_PROPOSAL" | null; versionId?: string | null; versionNumber?: number | null; validUntil?: string | null; decidedAt?: string | null };

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
export type ProposalSummaryData = { versionNumber: number; status: string; currency: string; documentType?: string; validUntil?: string; items: { quantity: number; unitPrice: number; optional: boolean }[] };
export type DepositSummaryData = { status: string; currency: string; totalDisplay?: number | null; paidDisplay?: number | null; balanceDisplay?: number | null };
export type CaseDocument = { documentId: string; fileName: string; status: string; createdAt: string };
export type CareView = "care" | "documents" | "messages";

type StepText = { title: string; body: string; next?: string };
/** The steps whose subject is the deposit: its facts belong inside the current step, not in a second block. */
const MONEY_STEPS = new Set(["WAIT_DEPOSIT_ARRANGEMENT", "PAY_DEPOSIT"]);

export function MyCare({ locale, caseSummary, actions, patientAction, patientProposal, proposal, deposit, documents, unreadMessages, cases, view, onView, onOpenCase, onOpenProposal, identityStep, messagesPanel, newCaseHref = null }: {
  locale: Locale; caseSummary: CaseSummary; actions: CaseActions; patientAction?: PatientAction | null; patientProposal?: PatientProposalState | null;
  proposal?: ProposalSummaryData | null; deposit?: DepositSummaryData | null; documents: CaseDocument[]; unreadMessages: number;
  /** Every case the account can open, this one included; the switcher shows from two. */
  cases: CaseSummary[]; view: CareView; onView: (view: CareView) => void;
  onOpenCase: (id: string) => void; onOpenProposal: () => void; identityStep?: ReactNode; messagesPanel: ReactNode;
  /** Where the account holder sends a new case of their own; null when it is not theirs to send from here. */
  newCaseHref?: string | null;
}) {
  const work = useWorkCopy();
  const t = work.myCare;
  const c = caseSummary;
  const code = actions.currentAction.code;
  const step = stepText(code, t.steps, { proposalState: patientProposal?.state ?? null, status: c.status });
  const body = code === "PROVIDE_INFORMATION" ? patientAction?.message?.trim() || step.body : step.body;
  // A case closed or cancelled says nothing about how far it got, so its journey shows no step as reached or current.
  const phase = c.status === "CLOSED" || c.status === "CANCELLED" ? -1 : phaseIndex(c.status);
  // The account acts for the patient on this case (per case, from the backend), so the page says whose care this is.
  const representative = actions.viewer === "REPRESENTATIVE";
  const canMessage = actions.availableActions.includes("MESSAGE_COORDINATOR");
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const date = (iso: string) => dateFormat.format(new Date(iso));
  const proposalTotal = proposal ? proposal.items.filter(i => !i.optional).reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) : null;
  const showProposal = !!patientProposal && ["READY", "ACCEPTED", "DECLINED", "EXPIRED"].includes(patientProposal.state) && !!proposal;
  const showDeposit = !!deposit && deposit.status !== "CANCELLED";
  const depositInStep = showDeposit && MONEY_STEPS.has(code);
  const focus = actions.currentAction.kind === "FOCUS";
  const showSwitcher = cases.length > 1;

  // Arriving from the case switcher: the card that was pressed is gone, so the new case's heading takes focus.
  useEffect(() => { if (takeArrivalFocus(c.id)) document.getElementById("case-heading")?.focus(); }, [c.id]);

  return (
    <div className="mx-auto max-w-[75rem]">
      {/* Small screens: the same three destinations the header carries on wider ones. */}
      <nav aria-label={t.nav.label} className="mb-5 flex gap-1 border-b border-line-strong md:hidden">
        {(["care", "documents", "messages"] as const).map(id => (
          <button key={id} type="button" aria-current={view === id ? "page" : undefined}
                  className={`-mb-px min-h-11 border-b-2 px-3 py-2.5 text-[0.9375rem] font-bold transition ${view === id ? "border-brand-600 text-brand-800" : "border-transparent text-ink-500 hover:text-ink-800"}`}
                  onClick={() => onView(id)}>
            {t.nav[id]}{id === "messages" && unreadMessages > 0 && <UnreadCount count={unreadMessages}/>}
          </button>
        ))}
      </nav>

      {showSwitcher && <CaseSwitcher cases={cases} currentId={c.id} phases={t.journey.phases} onOpenCase={onOpenCase} newCaseHref={newCaseHref}/>}

      {/* Case header: whose file this is and which case — no greeting, no identifiers beyond the reference they know. */}
      <header className="flex items-center gap-4 rounded-lg border border-line bg-white px-5 py-4 sm:px-6 sm:py-5">
        <CareAreaMark slug={c.careCategory} size="lg"/>
        <div className="min-w-0">
          {/* The case's heading, and where focus lands when the case or the view changes. */}
          <h2 id="case-heading" tabIndex={-1} className="headline scroll-mt-28 break-words rounded-sm text-brand-900 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">
            {!c.patientName ? <bdi dir="ltr">{c.caseNumber}</bdi>
              : representative ? fillTemplate(work.patient.careFor, { name: `⁨${c.patientName}⁩` }) : <bdi>{c.patientName}</bdi>}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.9375rem] leading-6">
            {/* Without a name, the heading already is the case number. */}
            {c.patientName && <><span className="sr-only">{t.header.caseNumber}: </span>
            <bdi dir="ltr" className="font-semibold text-brand-700 tabular-nums">{c.caseNumber}</bdi></>}
            {c.patientName && c.careCategory && <span aria-hidden className="text-ink-350">·</span>}
            {c.careCategory && <span className="text-ink-600">{careAreaLabel(c.careCategory, work.careAreas)}</span>}
          </p>
        </div>
      </header>

      {view === "documents" && (
        <section aria-labelledby="documents-title" className="card mt-5 p-5 sm:p-6">
          <h2 id="documents-title" className="text-[1.0625rem] font-bold text-brand-900">{t.documents.title}</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-600">{t.documents.hint}</p>
          {documents.length === 0 ? <p className="mt-4 text-[0.9375rem] text-ink-500">{t.documents.empty}</p>
            : <ul className="mt-4 divide-y divide-line">
                {documents.map(doc => (
                  <li key={doc.documentId} className="flex items-center gap-3 py-3">
                    <FileText size={17} aria-hidden className="flex-none text-brand-600"/>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink-800" dir="auto">{doc.fileName}</span>
                    <span className="text-[0.8125rem] text-ink-500">{date(doc.createdAt)}</span>
                  </li>
                ))}
              </ul>}
        </section>
      )}

      {view === "messages" && <div className="mt-5">{messagesPanel}</div>}

      {view === "care" && (
        <div className="mt-5 flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:items-start lg:gap-6">
          {/* CURRENT STEP — the focal card: the file's petrol tab edge, one primary action or a clear "nothing needed". */}
          <section aria-labelledby="current-step-title" className="card file-tab p-5 sm:p-7 lg:col-start-1 lg:row-start-1">
            <p className="eyebrow">{t.step.eyebrow}</p>
            <h2 id="current-step-title" className="statement mt-2.5 text-brand-900">{step.title}</h2>
            <p className="mt-3 max-w-[65ch] text-ink-600" dir="auto">{body}</p>

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
            {code === "COMPLETE_PROFILE" && actions.blockers.length > 0 && (
              <ul className="mt-4 list-disc space-y-1 ps-5 text-[0.9375rem] text-ink-800">
                {actions.blockers.map(b => <li key={b.code}>{locale === "ar" ? b.labelAr : b.labelEn}</li>)}
              </ul>
            )}

            {/* The money this step is about, inside the step: one place for the amount, on the facts panel. */}
            {depositInStep && deposit && <DepositFacts deposit={deposit} locale={locale} copy={t.deposit} level={3} className="mt-5 rounded-md bg-mist p-4 sm:p-5"/>}

            {/* Exactly one primary action, and only when the backend says the patient owes something. */}
            {focus && code === "REVIEW_PROPOSAL" && (
              <button type="button" className="btn-primary mt-6" onClick={onOpenProposal}>{t.step.reviewProposal}</button>
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
          </section>

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
          <section aria-labelledby="journey-title" className="card care-journey p-5 sm:p-6 lg:col-start-1 lg:row-start-2">
            <h2 id="journey-title" className="eyebrow">{t.journey.title}</h2>
            <ol className="mt-5 grid md:grid-cols-7">
              {t.journey.phases.map((label, index) => {
                const state = index < phase ? "reached" : index === phase ? "current" : "upcoming";
                return (
                  <li key={label} className="journey-step" aria-current={state === "current" ? "step" : undefined}>
                    {index < t.journey.phases.length - 1 && <span aria-hidden className="journey-link" data-reached={index < phase || undefined}/>}
                    <span aria-hidden className="journey-marker relative z-10 flex-none" data-state={state}>{index + 1}</span>
                    <span className={`text-[0.875rem] leading-5 ${state === "current" ? "font-semibold text-brand-900" : "text-ink-600"}`}>
                      {label}{state === "reached" && <span className="sr-only"> ({t.journey.done})</span>}{state === "current" && <span className="sr-only"> ({t.journey.current})</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* ESTIMATE — the document's summary and, once settled, one way to open it. */}
          {showProposal && proposal && patientProposal && (
            <section aria-labelledby="proposal-title" className="card p-5 sm:p-6 lg:col-start-1 lg:row-start-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h2 id="proposal-title" className="eyebrow">{(t.estimate.documentType as Record<string, string>)[proposal.documentType ?? ""] ?? t.estimate.proposal}</h2>
                <StatusBadge tone={proposalTone(patientProposal.state)}>{(t.estimate.status as Record<string, string>)[patientProposal.state] ?? patientProposal.state}</StatusBadge>
              </div>
              {proposalTotal != null && <p className="statement mt-3 text-brand-900 tabular-nums"><bdi dir="ltr">{formatMoney(proposalTotal, proposal.currency, locale)}</bdi></p>}
              {proposal.versionNumber > 1 && <p className="mt-1 text-[0.875rem] text-ink-500">{t.estimate.updated}</p>}
              {proposal.documentType === "PRELIMINARY_ESTIMATE" && <p className="mt-2 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.estimate.basis}</p>}
              {showDeposit && !depositInStep && deposit && <DepositFacts deposit={deposit} locale={locale} copy={t.deposit} level={3} className="mt-5 border-t border-line pt-4"/>}
              {/* One control for one outcome: reviewing is already the current step's action, so only the settled document gets a link here. */}
              {patientProposal.action === "VIEW_PROPOSAL" && (
                <button type="button" className="link-cta mt-4 inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem]" onClick={onOpenProposal}>
                  {t.estimate.view}<ArrowRight size={16} aria-hidden className="rtl:-scale-x-100"/>
                </button>
              )}
            </section>
          )}
          {showDeposit && !depositInStep && !showProposal && deposit && (
            <DepositFacts deposit={deposit} locale={locale} copy={t.deposit} level={2} className="card p-5 sm:p-6 lg:col-start-1 lg:row-start-3"/>
          )}

          {!showSwitcher && newCaseHref && (
            <p className="lg:col-start-1">
              <a href={newCaseHref} className="link-cta inline-flex min-h-11 items-center gap-2 text-[0.9375rem]"><Plus size={16} aria-hidden/>{t.cases.sendNew}</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The deposit as authoritative money in a truthful, offline state: amount, status in words, and what happens next. */
function DepositFacts({ deposit, locale, copy, level, className }: { deposit: DepositSummaryData; locale: Locale; copy: LocalizedWorkCopy["myCare"]["deposit"]; level: 2 | 3; className: string }) {
  const Heading = level === 2 ? "h2" : "h3";
  const status = copy.status as Record<string, string>, note = copy.note as Record<string, string>;
  return (
    <section aria-labelledby="deposit-title" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Heading id="deposit-title" className={level === 2 ? "eyebrow" : "label-micro text-ink-500"}>{copy.title}</Heading>
        <StatusBadge tone={depositTone(deposit.status)}>{status[deposit.status] ?? deposit.status}</StatusBadge>
      </div>
      <p className="statement mt-2 text-brand-900 tabular-nums"><bdi dir="ltr">{deposit.totalDisplay != null ? formatMoney(deposit.totalDisplay, deposit.currency, locale) : "—"}</bdi></p>
      {deposit.status === "PARTIALLY_PAID" && deposit.paidDisplay != null && (
        <p className="mt-1 text-[0.875rem] text-ink-600">{copy.received} <bdi dir="ltr" className="tabular-nums">{formatMoney(deposit.paidDisplay, deposit.currency, locale)}</bdi></p>
      )}
      {note[deposit.status] && <p className="mt-1.5 text-[0.875rem] leading-6 text-ink-600">{note[deposit.status]}</p>}
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

/**
 * The current step in the patient's words, keyed by the backend's action code (and, where one code reads two ways, the
 * stage or proposal state the backend also sent). Copy only — which code applies is never decided here.
 */
function stepText(code: string, steps: LocalizedWorkCopy["myCare"]["steps"], ctx: { proposalState: string | null; status: string }): StepText {
  const s = steps as Record<string, StepText>;
  switch (code) {
    case "WAIT_COORDINATOR_REVIEW": return ctx.status === "RECEIVED" ? s.WAIT_CASE_RECEIVED : s.WAIT_COORDINATOR_REVIEW;
    case "WAIT_PROPOSAL": return ctx.proposalState === "REVISION_REQUESTED" ? s.WAIT_PROPOSAL_REVISION : ctx.proposalState === "EXPIRED" ? s.WAIT_PROPOSAL_EXPIRED : s.WAIT_PROPOSAL;
    case "PROVIDE_INFORMATION": case "REVIEW_PROPOSAL": case "COMPLETE_PROFILE": case "VERIFY_IDENTITY": case "WAIT_CONSULTANT_REVIEW":
    case "WAIT_DEPOSIT_ARRANGEMENT": case "WAIT_COORDINATION": case "WAIT_TREATMENT": case "IN_TREATMENT": case "FOLLOW_UP": return s[code];
    default:
      if (ctx.status === "DECLINED" || ctx.status === "CLINICALLY_NOT_SUITABLE") return s[ctx.status];
      if (ctx.status === "CLOSED" || ctx.status === "CANCELLED") return s.CLOSED;
      return s.NONE;
  }
}

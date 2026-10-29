"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FocusEvent, type ReactNode } from "react";
import { Check, X } from "lucide-react";

import { formatCount, intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { LetterBlock } from "@/components/portal/GoingHomeStory";
import { CaseStamp } from "@/components/brand/CaseStamp";
import { ActForm, AmountInput, DocumentPicker, DoneAct, Fact, LaterAct, Money, Summary, Task as PanelTask, TimeField, instant, localInput, pick, readAmount, submit, text, type PanelDocument } from "@/components/portal/panel-parts";
import type { DischargePackItem, DischargeView, Mutate } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["discharge"];
/** The refusal, clock hint and cancel wording the recording forms share with the hospital file (UX 5-2). */
type FormCopy = { refused: string; retry: string; timeHint: string; cancel: string };
export type DischargeRole = "operations" | "coordinator" | "doctor";

/** Current actions and work types whose work is done in this panel, so "do it" lands on its next form (P1-17). */
export const DISCHARGE_WORK: ReadonlySet<string> = new Set(["COMPLETE_DISCHARGE_PACK", "DISCHARGE_PACK", "RECORD_FINAL_INVOICE", "CONFIRM_RETURN", "CONFIRM_DEPARTURE"]);
/** The case states this panel belongs to: the pack is prepared in treatment; the return and departure follow discharge. */
export const DISCHARGE_STAGES: ReadonlySet<string> = new Set(["TREATMENT_IN_PROGRESS", "DISCHARGED", "FOLLOW_UP"]);
const PACK_KINDS = ["DISCHARGE_SUMMARY", "MEDICATION_LIST", "OPERATIVE_NOTE", "IMPLANT_RECORD", "FIT_TO_FLY"] as const;
const RECORDABLE = new Set(["TREATMENT_IN_PROGRESS", "DISCHARGED"]);
const ANCHOR = "discharge-next";

/**
 * P1-17, staff case page: the "Discharge" panel (design §5 stage 5). It shows what still blocks discharge (discharge is
 * automatic once nothing does, so there is no discharge button), the pack with each document's facts, the follow-up plan,
 * the handover letter for the home doctor (English and Arabic, printable), the hospital's final invoice and the journey home,
 * all as `GET /{role}/cases/{id}/discharge` returns them. The Consultant records the pack documents, the follow-up plan and
 * generates the letter; Operations records the final invoice, confirms the return (a flight needs a valid fit to fly) and the
 * departure. One primary action — the viewer's next one — and the rest one click away. Once the patient is discharged the
 * panel carries the file's stamp on the day the case recorded it (UX 3-2), and for the Consultant, whose work has moved to
 * Follow-up, the rest folds into one line. Operations reads its part as acts in the order they happen (UX 5-3): the final
 * invoice, the return, the departure — a done act one line, the current one open with the view's one filled button — with the
 * pack and the letter as summary lines and their detail one click away.
 */
export function DischargePanel({ locale, role, caseId, caseStatus, currentCode, dischargedAt, documents = [], busy, mutate, load }: {
  locale: Locale; role: DischargeRole; caseId: string; caseStatus: string;
  /** When the case's timeline recorded the discharge: the stamp's date. No date, no stamp. */
  dischargedAt?: string | null;
  /** The viewer's current action code or work type, which picks what opens first. */
  currentCode?: string | null;
  documents?: PanelDocument[]; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const work = useWorkCopy();
  const t = work.discharge;
  const forms: FormCopy = useMemo(() => ({ refused: work.admission.forms.refused, retry: work.admission.forms.refusedRetry, timeHint: work.admission.forms.timeHint,
    cancel: work.admission.cancel }), [work]);
  const id = useId();
  const [view, setView] = useState<DischargeView | null | undefined>(undefined);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const when = (iso?: string | null) => iso ? dateTime.format(new Date(iso)) : "—";
  const egp = (amount?: number | null) => amount == null ? "—" : formatMoney(amount, "EGP", locale);

  const read = useCallback(() => load<DischargeView>(`/${role}/cases/${caseId}/discharge`).then(setView, () => setView(null)), [load, role, caseId]);
  useEffect(() => {
    let live = true;
    load<DischargeView>(`/${role}/cases/${caseId}/discharge`).then(value => { if (live) setView(value); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, role, caseId, caseStatus]);

  /** Every discharge command answers with the panel's view; the follow-up plan answers with its id, so read it again. */
  const act = useCallback(async (path: string, body?: unknown) => {
    const result: unknown = await mutate(path, body);
    if (!result) return false;
    if (typeof result === "object" && result !== null && "pack" in result && "blockers" in result) setView(result as DischargeView); else await read();
    // A recorded act becomes its one-line fact and its form goes: focus moves on to the act now open (or the panel's heading),
    // never to the page's top (UX 5-3, as the hospital file does).
    requestAnimationFrame(() => {
      const lost = document.activeElement;
      if (lost && lost !== document.body && lost.isConnected) return;
      (document.getElementById(ANCHOR)?.querySelector<HTMLElement>("select,input,textarea,button") ?? document.getElementById(`${id}-title`))?.focus();
    });
    return true;
  }, [mutate, read, id]);

  if (view === undefined) return null;
  if (view === null) return <section id="discharge-panel" className="card p-5"><h3 className="title text-base">{t.title}</h3><p role="alert" className="mt-2 text-[0.875rem] text-alert-800">{t.loadFailed}</p></section>;

  const status = view.caseStatus ?? caseStatus;
  const discharged = status === "DISCHARGED" || status === "FOLLOW_UP";
  const recordable = RECORDABLE.has(status);
  const missingKind = view.pack.find(item => item.status === "MISSING")?.kind ?? null;
  // The next thing this viewer does here: it opens first and carries the panel's one primary button.
  const doctorWork = currentCode === "COMPLETE_DISCHARGE_PACK" || currentCode === "DISCHARGE_PACK";
  const next = role === "doctor" && recordable && doctorWork ? (missingKind ? "pack" : !view.followUpPlan ? "plan" : null)
    : role === "operations" ? (currentCode === "RECORD_FINAL_INVOICE" && !view.finalInvoice ? "invoice"
      : currentCode === "CONFIRM_RETURN" && !view.returnTravel && !view.departedAt ? "return"
      : (currentCode === "CONFIRM_RETURN" || currentCode === "CONFIRM_DEPARTURE") && view.returnTravel && !view.departedAt ? "departure" : null)
    : null;
  const stateLine = !discharged ? (view.readyForDischarge ? t.state.ready : null)
    : view.reconciliationSettled ? t.state.settled : t.state.awaitingSettlement;

  // The pack, the follow-up plan and the letter: the Consultant's record, read by everyone.
  const packAndLetter = (
    <>
      <h4 className="mt-4 text-[0.875rem] font-bold text-ink-800">{t.pack.title}</h4>
      <ul className="mt-1 divide-y divide-line">
        {view.pack.map(item => <PackRow key={item.kind} t={t} item={item} when={when}/>)}
      </ul>

      {/* FOLLOW-UP PLAN AND THE LETTER */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.followUp.title}</h4>
        <p className="mt-1 text-[0.875rem] text-ink-700">{view.followUpPlan
          ? `${pick(t.followUp.modes, view.followUpPlan.mode)} · ${fillTemplate(t.followUp.due, { when: when(view.followUpPlan.dueAt) })}` : t.followUp.none}</p>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        {view.handoverLetter && (view.handoverLetter.english || view.handoverLetter.arabic)
          ? <><LetterBlock headingLevel={4} copy={{ title: t.letter.title, hint: t.letter.hint, english: t.letter.english, arabic: t.letter.arabic, print: t.letter.print }} letter={view.handoverLetter}/>
              <p className="text-[0.8125rem] text-ink-600">{fillTemplate(t.letter.generated, { when: when(view.handoverLetter.generatedAt) })}</p></>
          : <><h4 className="text-[0.875rem] font-bold text-ink-800">{t.letter.title}</h4><p className="mt-1 text-[0.875rem] text-ink-600">{view.handoverLetter ? fillTemplate(t.letter.generated, { when: when(view.handoverLetter.generatedAt) }) : t.letter.none}</p></>}
        {role === "doctor" && DISCHARGE_STAGES.has(status) && (
          <button type="button" className="btn-secondary mt-2" disabled={busy} onClick={() => void act(`/doctor/cases/${caseId}/discharge/handover-letter`)}>
            {view.handoverLetter ? t.letter.regenerate : t.letter.generate}
          </button>
        )}
      </div>
    </>
  );

  return (
    <section id="discharge-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`${id}-title`} tabIndex={-1} className="title rounded-sm text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">{t.title}</h3>
        {discharged && (dischargedAt ? <CaseStamp label={t.state.discharged} date={dischargedAt} locale={locale} variant="line"/>
          : <StatusBadge tone="success">{t.state.discharged}</StatusBadge>)}
      </div>
      {stateLine && <p className="mt-1 text-[0.875rem] text-ink-700">{stateLine}</p>}
      {/* WHAT BLOCKS DISCHARGE — instead of a button: discharge happens on its own once this list is empty. */}
      {!discharged && view.blockers.length > 0 && (
        <div className="mt-3">
          <p className="text-[0.875rem] font-bold text-ink-800">{t.state.blocked}</p>
          <ul className="mt-1 space-y-1 text-[0.875rem] text-ink-700">
            {view.blockers.map(b => <li key={b.code} className="flex items-start gap-2"><span aria-hidden className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-ink-400"/>{pick(t.blockers, b.code)}</li>)}
          </ul>
          <p className="mt-1.5 max-w-[65ch] text-[0.8125rem] text-ink-600">{t.automatic}</p>
        </div>
      )}

      {role === "operations" ? (
        <OperationsHome t={t} forms={forms} view={view} caseId={caseId} status={status} next={next} documents={documents} busy={busy} act={act} when={when} egp={egp}
                        packAndLetter={packAndLetter}/>
      ) : (
      <Fold fold={discharged && role === "doctor"} label={t.details}>
      {packAndLetter}

      {/* THE FINAL INVOICE AND THE JOURNEY HOME */}
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.invoice.title}</h4>
        {view.finalInvoice ? (
          <dl className="mt-2 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-3">
            <Fact label={t.invoice.number}><bdi dir="ltr" translate="no">{view.finalInvoice.reference ?? "—"}</bdi></Fact>
            <Fact label={t.invoice.amountEgp}><Money>{egp(view.finalInvoice.amountEgp)}</Money></Fact>
            <Fact label={t.invoice.issuedAt}>{when(view.finalInvoice.effectiveAt ?? view.finalInvoice.recordedAt)}</Fact>
          </dl>
        ) : <p className="mt-1 text-[0.875rem] text-ink-600">{t.invoice.none}</p>}
        {view.finalInvoice && <p className="mt-1 text-[0.8125rem] text-ink-600">{view.finalInvoice.countersignedAt ? `${t.invoice.countersigned} · ${when(view.finalInvoice.countersignedAt)}` : t.invoice.awaiting}</p>}
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.travel.title}</h4>
        {view.returnTravel ? (
          <p className="mt-1 text-[0.875rem] text-ink-800">
            {fillTemplate(t.travel.returnLine, { mode: pick(t.travel.modes, view.returnTravel.mode), when: when(view.returnTravel.departureAt) })}
            {view.returnTravel.reference && <> · {t.travel.reference} <bdi dir="ltr" translate="no">{view.returnTravel.reference}</bdi></>}
          </p>
        ) : <p className="mt-1 text-[0.875rem] text-ink-600">{t.travel.none}</p>}
        {view.departedAt && <p className="mt-1 text-[0.875rem] font-semibold text-ink-800">{fillTemplate(t.travel.departed, { when: when(view.departedAt) })}</p>}
      </div>

      {/* RECORDING — the Consultant */}
      {role === "doctor" && recordable && (
        <div className="mt-3">
          <Task title={t.packForm.title} next={next === "pack"}>
            <PackForm key={missingKind ?? "all"} t={t} documents={documents} busy={busy} primary={next === "pack"} initialKind={doctorWork ? missingKind ?? "" : ""} timeHint={forms.timeHint}
                      fitToFlyHours={view.fitToFlyHours} onRecord={body => act(`/doctor/cases/${caseId}/discharge/pack`, body)}/>
          </Task>
          {!view.followUpPlan && (
            <Task title={t.followUp.form} next={next === "plan"}>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/doctor/cases/${caseId}/follow-ups`, {
                dueAt: instant(data.get("dueAt")), mode: data.get("mode"), requiredTests: text(data.get("tests")), instructions: text(data.get("instructions")) }))}>
                <TimeField label={t.followUp.dueAt} name="dueAt" hint={forms.timeHint}/>
                <label className="block text-sm font-semibold">{t.followUp.mode}
                  <select className="field" name="mode" defaultValue="VIDEO">{(["VIDEO", "PHONE", "IN_PERSON"] as const).map(m => <option key={m} value={m}>{t.followUp.modes[m]}</option>)}</select>
                </label>
                <label className="block text-sm font-semibold sm:col-span-2">{t.followUp.tests}<textarea className="field" name="tests" rows={2} maxLength={20000}/></label>
                <label className="block text-sm font-semibold sm:col-span-2">{t.followUp.instructions}<textarea className="field" name="instructions" rows={2} maxLength={20000}/></label>
                <div className="sm:col-span-2"><button className={next === "plan" ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.followUp.save}</button></div>
              </form>
            </Task>
          )}
        </div>
      )}

      </Fold>
      )}
    </section>
  );
}

/** After discharge the Consultant reads this panel as its summary line; the pack, the letter and the journey home stay one click away. */
function Fold({ fold, label, children }: { fold: boolean; label: string; children: ReactNode }) {
  if (!fold) return <>{children}</>;
  return <details className="group mt-3 border-t border-line"><Summary>{label}</Summary><div className="pb-2">{children}</div></details>;
}

function Task({ title, next, children }: { title: string; next: boolean; children: ReactNode }) {
  return <PanelTask title={title} next={next} anchor={ANCHOR}>{children}</PanelTask>;
}

/** A run of text that keeps its own direction inside a sentence of the other script (references, amounts, times). */
const isolate = (value: string) => `⁨${value}⁩`;

/**
 * UX 5-3: Operations' part of going home, as acts in the order they happen — the hospital's final invoice, the return, the
 * departure (which ends Operations' part, so it asks first). A done act is one line, with its correction behind a disclosure
 * while it still takes one; only the current act is open, with the view's one filled button; a later act is named so the order
 * is plain. Then the pack and the letter as summary lines, their detail one click away. Presentation only: the backend decides.
 */
function OperationsHome({ t, forms, view, caseId, status, next, documents, busy, act, when, egp, packAndLetter }: {
  t: Copy; forms: FormCopy; view: DischargeView; caseId: string; status: string; next: string | null; documents: PanelDocument[]; busy: boolean;
  act: (path: string, body?: unknown) => Promise<boolean>; when: (iso?: string | null) => string; egp: (amount?: number | null) => string; packAndLetter: ReactNode;
}) {
  const a = t.acts;
  const id = useId();
  const { locale } = useWorkCopy();
  const discharged = status === "DISCHARGED" || status === "FOLLOW_UP";
  const invoiceOpen = RECORDABLE.has(status) && !view.reconciliationSettled;
  const returnOpen = DISCHARGE_STAGES.has(status) && !view.departedAt;
  const departureOpen = discharged && !!view.returnTravel && !view.departedAt;
  const invoice = view.finalInvoice;
  const back = view.returnTravel;
  const fitToFly = view.pack.find(item => item.kind === "FIT_TO_FLY" && item.status === "DONE") ?? null;
  const owed = view.pack.filter(item => item.status !== "NOT_REQUIRED");
  const recorded = owed.filter(item => item.status === "DONE").length;
  // A task brings its own rule; a done or later act takes one, so each act is ruled once.
  const ruled = (task: boolean) => task ? undefined : "border-t border-line";

  const invoiceForm = (
    <ActForm key={invoice?.id ?? "new"} className="grid gap-3 sm:grid-cols-2" refused={forms.refused} retry={forms.retry} action={data => act(`/operations/cases/${caseId}/discharge/final-invoice`, {
      documentId: data.get("documentId"), invoiceNumber: String(data.get("invoiceNumber") ?? "").trim(), amountEgp: readAmount(data.get("amountEgp")),
      issuedAt: instant(data.get("issuedAt")), replaces: invoice?.id ?? null })}>
      <DocumentPicker name="documentId" label={t.invoice.document} empty={t.invoice.chooseDocument} documents={documents} required/>
      <label className="block text-sm font-semibold">{t.invoice.number}<input className="field" name="invoiceNumber" maxLength={80} required autoComplete="off" spellCheck={false} dir="ltr" defaultValue={invoice?.reference ?? ""}/></label>
      {/* UX X-1: a text field read by readAmount, so an Arabic keypad's digits count (a number field drops them). */}
      <div><label htmlFor={`${id}-invoice-amount`} className="block text-sm font-semibold">{t.invoice.amountEgp}</label>
        <AmountInput id={`${id}-invoice-amount`} name="amountEgp" invalid={t.invoice.amountInvalid} accepts="zero" defaultValue={invoice?.amountEgp ?? undefined}/></div>
      <TimeField label={t.invoice.issuedAt} name="issuedAt" hint={forms.timeHint} defaultValue={localInput(invoice?.effectiveAt ?? invoice?.recordedAt)}/>
      {!documents.some(d => d.status === "CLEAN") && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{t.packForm.noDocuments}</p>}
      <div className="sm:col-span-2"><button className={next === "invoice" ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.invoice.record}</button></div>
    </ActForm>
  );
  const returnForm = <ReturnForm key={back?.evidenceId ?? "new"} t={t} forms={forms} stored={back ?? null} fitToFly={fitToFly} when={when} busy={busy} primary={next === "return"}
                                 onConfirm={body => act(`/operations/cases/${caseId}/discharge/return`, body)}/>;
  const returnLine = back && <>{fillTemplate(t.travel.returnLine, { mode: pick(t.travel.modes, back.mode), when: isolate(when(back.departureAt)) })}
    {back.reference && <> · {t.travel.reference} <bdi dir="ltr" translate="no">{back.reference}</bdi></>}</>;

  return (
    <>
      <ol role="list" aria-label={a.title} className="mt-3 border-b border-line">
        <li className={ruled(!invoice && invoiceOpen)}>{invoice
          ? <DoneAct tone={invoice.countersignedAt ? "done" : "waiting"} change={invoiceOpen ? t.invoice.formCorrect : undefined}
              fact={<>{fillTemplate(a.invoice, { number: isolate(invoice.reference ?? "—"), amount: isolate(egp(invoice.amountEgp)) })} · {invoice.countersignedAt ? a.countersigned : a.awaitingCheck}</>}>{invoiceForm}</DoneAct>
          : invoiceOpen ? <Task title={t.invoice.form} next={next === "invoice"}>{invoiceForm}</Task>
          : <LaterAct notYet={a.notYet}>{t.invoice.form}</LaterAct>}</li>
        <li className={ruled(!back && returnOpen)}>{back
          ? <DoneAct fact={<>{a.returned} · {returnLine}</>} change={returnOpen ? a.changeReturn : undefined}>{returnForm}</DoneAct>
          : returnOpen ? <Task title={t.travel.form} next={next === "return"}>{returnForm}</Task>
          : <LaterAct notYet={a.notYet}>{t.travel.form}</LaterAct>}</li>
        <li className={ruled(departureOpen)}>{view.departedAt
          ? <DoneAct fact={<>{fillTemplate(t.travel.departed, { when: isolate(when(view.departedAt)) })} · {a.ended}</>}/>
          : departureOpen ? <Task title={t.travel.departureForm} next={next === "departure"}>
              <DepartureForm t={t} forms={forms} busy={busy} primary={next === "departure"} when={when}
                             onConfirm={departedAt => act(`/operations/cases/${caseId}/discharge/departure`, { departedAt })}/>
            </Task>
          : <LaterAct notYet={a.notYet}>{t.travel.departureForm}</LaterAct>}</li>
      </ol>

      {/* THE PACK AND THE LETTER — the Consultant's, read here as two lines. */}
      <ul role="list" className="mt-3 space-y-1 text-[0.875rem] text-ink-700">
        <li>{fillTemplate(a.pack, { done: formatCount(recorded, locale), total: formatCount(owed.length, locale) })}
          {fitToFly?.validUntil && <> · {fillTemplate(a.fitToFly, { when: isolate(when(fitToFly.validUntil)) })}</>}</li>
        <li>{view.handoverLetter ? fillTemplate(a.letter, { when: isolate(when(view.handoverLetter.generatedAt)) }) : a.noLetter}</li>
      </ul>
      <details className="mt-2 border-t border-line">
        <Summary>{a.details}</Summary>
        <div className="pb-2">{packAndLetter}</div>
      </details>
    </>
  );
}

function packTone(status: string): StatusTone {
  return status === "DONE" ? "success" : status === "MISSING" ? "warning" : "neutral";
}

/** One pack document with its facts (null for a reader without the clinical record). */
function PackRow({ t, item, when }: { t: Copy; item: DischargePackItem; when: (iso?: string | null) => string }) {
  const done = item.status === "DONE";
  return (
    <li className="py-2 text-[0.875rem]">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden className={`grid h-4 w-4 flex-none place-items-center rounded-full ${done ? "bg-brand-600 text-white" : "border border-ink-350 bg-white"}`}>{done && <Check size={10} strokeWidth={3}/>}</span>
        <span className="font-semibold text-ink-900">{pick(t.pack.kinds, item.kind)}</span>
        <StatusBadge tone={packTone(item.status)}>{pick(t.pack.status, item.status)}</StatusBadge>
        {done && item.recordedAt && <span className="text-[0.8125rem] text-ink-600">{fillTemplate(t.pack.recorded, { when: when(item.recordedAt) })}</span>}
      </p>
      {item.kind === "FIT_TO_FLY" && done && (
        <p className="mt-0.5 ps-6 text-[0.8125rem] text-ink-700">
          {fillTemplate(t.pack.examined, { when: when(item.examinedAt) })}{item.validUntil && <> · <strong className="font-semibold">{fillTemplate(t.pack.validUntil, { when: when(item.validUntil) })}</strong></>}
        </p>
      )}
      {(item.diagnosis || item.procedures || item.pendingResults || item.warningSigns || item.medications?.length || item.implants?.length || item.note) && (
        <dl className="mt-1 grid gap-x-4 ps-6 text-[0.8125rem] sm:grid-cols-[auto_1fr]">
          {item.diagnosis && <Detail label={t.pack.diagnosis}>{item.diagnosis}</Detail>}
          {item.procedures && <Detail label={t.pack.procedures}>{item.procedures}</Detail>}
          {item.pendingResults && <Detail label={t.pack.pendingResults}>{item.pendingResults}</Detail>}
          {item.warningSigns && <Detail label={t.pack.warningSigns}>{item.warningSigns}</Detail>}
          {item.medications && item.medications.length > 0 && <Detail label={t.pack.medications}>
            <ul>{item.medications.map((m, i) => <li key={i} dir="auto">{[m.name, m.dose, m.frequency, m.duration].join(" · ")}</li>)}</ul>
          </Detail>}
          {item.implants && item.implants.length > 0 && <Detail label={t.pack.implants}>
            <ul>{item.implants.map((m, i) => <li key={i} dir="auto">{[m.description, m.manufacturer, m.reference].filter(Boolean).join(" · ")}</li>)}</ul>
          </Detail>}
          {item.note && <Detail label={t.pack.note}>{item.note}</Detail>}
        </dl>
      )}
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <><dt className="text-ink-500">{label}</dt><dd dir="auto" className="min-w-0 whitespace-pre-wrap break-words text-ink-800">{children}</dd></>;
}

type Field = { key: string; label: string; required: boolean; maxLength: number };
type Row = Record<string, string> & { key: string };

/** Repeating rows (medicines, implants): each row's fields, a remove button from two rows, and an add button up to `max`. */
function Rows({ legend, rowLabel, removeLabel, addLabel, fields, rows, setRows, max }: {
  legend: string; rowLabel: string; removeLabel: string; addLabel: string; fields: Field[]; rows: Row[]; setRows: (update: (rows: Row[]) => Row[]) => void; max: number;
}) {
  const blank = (key: string): Row => ({ key, ...Object.fromEntries(fields.map(f => [f.key, ""])) });
  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      <ol className="mt-1 space-y-3">
        {rows.map((row, index) => {
          const n = String(index + 1);
          return (
            <li key={row.key} className="grid gap-2 border-t border-line pt-2 sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))_auto] sm:items-end" style={{ ["--cols" as string]: fields.length }}>
              <span className="sr-only">{fillTemplate(rowLabel, { n })}</span>
              {fields.map(f => (
                <label key={f.key} className="block text-[0.8125rem] font-semibold">{f.label}
                  <input className="field" required={f.required} maxLength={f.maxLength} autoComplete="off" dir="auto" value={row[f.key]}
                         onChange={event => { const value = event.target.value; setRows(all => all.map(r => r.key === row.key ? { ...r, [f.key]: value } : r)); }}/>
                </label>
              ))}
              {rows.length > 1 && <button type="button" className="btn-secondary" onClick={() => setRows(all => all.filter(r => r.key !== row.key))}>
                <X size={16} aria-hidden/><span className="sr-only">{fillTemplate(removeLabel, { n })}</span></button>}
            </li>
          );
        })}
      </ol>
      {rows.length < max && <button type="button" className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-brand-700"
        onClick={() => setRows(all => [...all, blank(`${Date.now()}-${all.length}`)])}>{addLabel}</button>}
    </fieldset>
  );
}

type PackBody = { kind: string; documentId: string | null; diagnosis: string | null; procedures: string | null; pendingResults: string | null; warningSigns: string | null;
  medications: Record<string, string>[] | null; implants: Record<string, string | null>[] | null; examinedAt: string | null; note: string | null };

/** The Consultant's pack form: a typed clean document plus the facts each kind owes (the backend checks them again). */
function PackForm({ t, documents, busy, primary, initialKind, timeHint, fitToFlyHours, onRecord }: {
  t: Copy; documents: PanelDocument[]; busy: boolean; primary: boolean; initialKind: string; timeHint: string; fitToFlyHours: number; onRecord: (body: PackBody) => Promise<boolean>;
}) {
  const f = t.packForm;
  const [kind, setKind] = useState(initialKind);
  const medicineFields: Field[] = [{ key: "name", label: f.medName, required: true, maxLength: 200 }, { key: "dose", label: f.dose, required: true, maxLength: 120 },
    { key: "frequency", label: f.frequency, required: true, maxLength: 120 }, { key: "duration", label: f.duration, required: true, maxLength: 120 }];
  const implantFields: Field[] = [{ key: "description", label: f.implantDescription, required: true, maxLength: 300 }, { key: "manufacturer", label: f.manufacturer, required: false, maxLength: 160 },
    { key: "reference", label: f.implantReference, required: false, maxLength: 160 }];
  const [medicines, setMedicines] = useState<Row[]>(() => [{ key: "m0", name: "", dose: "", frequency: "", duration: "" }]);
  const [implants, setImplants] = useState<Row[]>(() => [{ key: "i0", description: "", manufacturer: "", reference: "" }]);
  const strip = (rows: Row[]) => rows.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => k !== "key").map(([k, v]) => [k, v.trim()])));
  return (
    <form className="mt-2 grid gap-3 sm:grid-cols-2" onSubmit={submit(async data => {
      const done = await onRecord({ kind, documentId: text(data.get("documentId")),
        diagnosis: kind === "DISCHARGE_SUMMARY" ? text(data.get("diagnosis")) : null, procedures: kind === "DISCHARGE_SUMMARY" ? text(data.get("procedures")) : null,
        pendingResults: kind === "DISCHARGE_SUMMARY" ? text(data.get("pendingResults")) : null, warningSigns: kind === "DISCHARGE_SUMMARY" ? text(data.get("warningSigns")) : null,
        medications: kind === "MEDICATION_LIST" ? strip(medicines) : null,
        implants: kind === "IMPLANT_RECORD" ? strip(implants).map(row => ({ description: row.description, manufacturer: row.manufacturer || null, reference: row.reference || null })) : null,
        examinedAt: kind === "FIT_TO_FLY" ? instant(data.get("examinedAt")) : null, note: text(data.get("note")) });
      if (done) { setKind(""); setMedicines([{ key: "m0", name: "", dose: "", frequency: "", duration: "" }]); setImplants([{ key: "i0", description: "", manufacturer: "", reference: "" }]); }
      return done;
    })}>
      <label className="block text-sm font-semibold">{f.kind}
        <select className="field" name="kind" required value={kind} onChange={event => setKind(event.target.value)}>
          <option value="">{f.chooseKind}</option>
          {PACK_KINDS.map(k => <option key={k} value={k}>{t.pack.kinds[k]}</option>)}
        </select>
      </label>
      <DocumentPicker name="documentId" label={f.document} empty={f.chooseDocument} documents={documents} required/>
      {!documents.some(d => d.status === "CLEAN") && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{f.noDocuments}</p>}
      {kind && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{f.correction}</p>}
      {kind === "DISCHARGE_SUMMARY" && <>
        <label className="block text-sm font-semibold sm:col-span-2">{f.diagnosis}<textarea className="field" name="diagnosis" rows={2} maxLength={2000} required dir="auto"/></label>
        <label className="block text-sm font-semibold sm:col-span-2">{f.procedures}<textarea className="field" name="procedures" rows={2} maxLength={2000} dir="auto"/></label>
        <label className="block text-sm font-semibold sm:col-span-2">{f.pendingResults}<textarea className="field" name="pendingResults" rows={2} maxLength={2000} dir="auto"/></label>
        <WarningSigns t={t}/>
      </>}
      {kind === "MEDICATION_LIST" && <>
        <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{f.noneHint}</p>
        <Rows legend={t.pack.medications} rowLabel={f.medicine} removeLabel={f.removeMedicine} addLabel={f.addMedicine} fields={medicineFields} rows={medicines} setRows={setMedicines} max={30}/>
      </>}
      {kind === "IMPLANT_RECORD" && <Rows legend={t.pack.implants} rowLabel={f.implant} removeLabel={f.removeImplant} addLabel={f.addImplant} fields={implantFields} rows={implants} setRows={setImplants} max={20}/>}
      {kind === "FIT_TO_FLY" && <>
        <TimeField label={f.examinedAt} name="examinedAt" hint={timeHint}/>
        <p className="self-end text-[0.8125rem] text-ink-600">{fillTemplate(f.fitToFlyHint, { hours: String(fitToFlyHours) })}</p>
      </>}
      <label className="block text-sm font-semibold sm:col-span-2">{f.note}<textarea className="field" name="note" rows={2} maxLength={2000} dir="auto"/></label>
      <div className="sm:col-span-2"><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{f.record}</button></div>
    </form>
  );
}

function WarningSigns({ t }: { t: Copy }) {
  const id = useId();
  return (
    <div className="sm:col-span-2">
      <label htmlFor={`${id}-signs`} className="block text-sm font-semibold">{t.packForm.warningSigns}</label>
      <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-500">{t.packForm.warningSignsHint}</p>
      <textarea id={`${id}-signs`} className="field" name="warningSigns" rows={3} maxLength={2000} required dir="auto" aria-describedby={`${id}-hint`}/>
    </div>
  );
}

/**
 * Operations confirms the return: a flight says which fit to fly it rests on, or that the Consultant must record one first. A
 * change reopens on the return as stored (keyed on it, so a newer return reseeds it).
 */
function ReturnForm({ t, forms, stored, fitToFly, when, busy, primary, onConfirm }: {
  t: Copy; forms: FormCopy; stored: DischargeView["returnTravel"] | null; fitToFly: DischargePackItem | null; when: (iso?: string | null) => string; busy: boolean; primary: boolean;
  onConfirm: (body: { mode: string; departureAt: string | null; reference: string | null }) => Promise<boolean>;
}) {
  const [mode, setMode] = useState(stored?.mode ?? "FLIGHT");
  return (
    <ActForm className="grid gap-3 sm:grid-cols-2" refused={forms.refused} retry={forms.retry} action={async data => {
      const done = await onConfirm({ mode, departureAt: instant(data.get("departureAt")), reference: text(data.get("reference")) });
      if (done) setMode(stored?.mode ?? "FLIGHT");
      return done;
    }}>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-semibold">{t.travel.mode}</legend>
        <div className="mt-1 flex flex-wrap gap-x-6">
          {(["FLIGHT", "GROUND"] as const).map(m => (
            <label key={m} className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)}/>{t.travel.modes[m]}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "FLIGHT" && <p className="text-[0.8125rem] text-ink-700 sm:col-span-2">
        {fitToFly?.validUntil ? fillTemplate(t.travel.flightNeeds, { when: isolate(when(fitToFly.validUntil)) }) : t.travel.flightMissing}</p>}
      <TimeField label={t.travel.departureAt} name="departureAt" hint={forms.timeHint} defaultValue={localInput(stored?.departureAt)}/>
      <label className="block text-sm font-semibold">{t.travel.referenceField}
        <input className="field" name="reference" maxLength={160} autoComplete="off" spellCheck={false} dir="ltr" defaultValue={stored?.reference ?? ""}/></label>
      <div className="sm:col-span-2"><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{stored ? t.acts.saveReturn : t.travel.confirm}</button></div>
    </ActForm>
  );
}

/**
 * The patient has left: the time, prefilled with now (moved on to now each time the officer comes back to the form while it
 * is untouched, so a page left open never confirms an old time), and a confirmation, because it ends Operations' part.
 */
function DepartureForm({ t, forms, busy, primary, when, onConfirm }: {
  t: Copy; forms: FormCopy; busy: boolean; primary: boolean; when: (iso?: string | null) => string; onConfirm: (departedAt: string | null) => Promise<boolean>;
}) {
  const [openedAt] = useState(() => localInput(new Date().toISOString()));
  const freshNow = (event: FocusEvent<HTMLFormElement>) => {
    const at = event.currentTarget.elements.namedItem("departedAt");
    if (!(at instanceof HTMLInputElement) || (event.target as EventTarget) === at || at.value !== at.defaultValue) return;
    at.defaultValue = at.value = localInput(new Date().toISOString());
  };
  return (
    <ActForm className="flex flex-col items-start gap-3" refused={forms.refused} retry={forms.retry} onFocusCapture={freshNow}
      confirm={{ title: data => fillTemplate(t.acts.departureConfirm, { time: isolate(when(instant(data.get("departedAt")))) }), body: t.acts.departureConfirmBody,
        confirm: t.travel.confirmDeparture, cancel: forms.cancel }}
      action={data => onConfirm(instant(data.get("departedAt")))}>
      <TimeField label={t.travel.departedAt} name="departedAt" hint={forms.timeHint} defaultValue={openedAt}/>
      <button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.travel.confirmDeparture}</button>
    </ActForm>
  );
}

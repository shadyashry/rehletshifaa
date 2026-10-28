"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { ActForm, DocumentPicker, DoneAct, Fact, LaterAct, Money, Summary, Task as PanelTask, TimeField, instant, localInput, pick, text, type PanelDocument } from "@/components/portal/panel-parts";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { CURRENCY_LABELS, type AdmissionEvidence, type AdmissionView, type DirectoryFacility, type Mutate } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["admission"];
type Doc = PanelDocument;
export type AdmissionRole = "operations" | "finance" | "coordinator" | "doctor";

/** The case stages the panel belongs to (P1-15): from travel coordination, where Operations reserves, to treatment. */
export const ADMISSION_STAGES: ReadonlySet<string> = new Set(["TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "ADMISSION_READY", "TREATMENT_IN_PROGRESS"]);
/** Current actions and work types whose work is done in this panel, so "do it" lands on its next form. */
export const ADMISSION_WORK: ReadonlySet<string> = new Set(["RECORD_HOSPITAL_BALANCE", "RECORD_ADMISSION_NUMBER", "CHECK_PROFORMA", "PRICE_VARIANCE",
  "REVISE_ADMISSION_LETTER", "COUNTERSIGN_BALANCE", "APPROVE_POINT_OF_NO_RETURN", "EMERGENCY_ADMISSION_REVIEW", "ADMISSION_VOUCHER_BLOCKED"]);
/** Ledger rows Finance countersigns from here (a letter is countersigned by its own decision). */
const COUNTERSIGNED_HERE = new Set(["BALANCE_EVIDENCED", "POINT_OF_NO_RETURN"]);
const LETTER_DECIDABLE = new Set(["CHECK_PENDING", "VARIANCE_OPEN"]);

/**
 * P1-15, staff case page: the "Admission & money" panel (design §5 stages 1–3). It shows the reservation, the frozen voucher
 * and what is still owed exactly as the API returns them, the checklist to ADMISSION_READY (the backend's
 * `admissionBlockers`) and the evidence trail; and it carries each role's recording: Operations reserves, records the letter,
 * the cashier receipt, the point of no return and the admission number; Finance decides the letter, countersigns and records
 * the fee balance (step-up: the portal re-signs in and replays); the Consultant reads it as a summary (UX 3-2) and records an
 * emergency admission, then the hospital's admission number after it (B-3-1b). The admission number on a cleared case starts
 * treatment. The backend
 * decides every rule; the panel offers one primary action — the next one — and keeps the rest one click away. For Operations
 * (UX 5-1) the recordings are one hospital file in the order they happen, with the travel plan in its place among them.
 */
export function AdmissionPanel({ locale, role, caseId, caseStatus, currentCode, documents = [], facilities = [], busy, mutate, load, travel, onView }: {
  locale: Locale; role: AdmissionRole; caseId: string; caseStatus: string;
  /** The viewer's current action code or work type, which picks the form that opens first. */
  currentCode?: string | null;
  documents?: Doc[]; facilities?: DirectoryFacility[]; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
  /** Operations: the travel act, drawn in the hospital file between the letter and the receipt; `current` when it is the act now. */
  travel?: (current: boolean) => ReactNode;
  /** Told each view the panel shows, so the page can read the reservation back (the logistics card). */
  onView?: (view: AdmissionView | null) => void;
}) {
  const t = useWorkCopy().admission;
  const id = useId();
  const [view, setView] = useState<AdmissionView | null | undefined>(undefined);
  // The page hears each view without its callback ever re-running the reads.
  const tell = useRef(onView);
  useEffect(() => { tell.current = onView; });
  useEffect(() => { if (view !== undefined) tell.current?.(view); }, [view]);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const when = (iso?: string | null) => iso ? dateTime.format(new Date(iso)) : "—";
  const egp = (amount?: number | null) => amount == null ? "—" : formatMoney(amount, "EGP", locale);

  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }), [locale]);
  const read = useCallback(() => load<AdmissionView>(`/${role}/cases/${caseId}/admission`).then(setView, () => setView(null)), [load, role, caseId]);
  useEffect(() => {
    let live = true;
    load<AdmissionView>(`/${role}/cases/${caseId}/admission`).then(value => { if (live) setView(value); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, role, caseId, caseStatus]);

  /** Every command answers with the panel's view (the emergency admission with an id): show it, or read it again. */
  const act = useCallback(async (path: string, body?: unknown) => {
    const result: unknown = await mutate(path, body);
    if (!result) return false;
    if (typeof result === "object" && result !== null && "admissionBlockers" in result) setView(result as AdmissionView); else await read();
    // A recorded act becomes its one-line fact and its form goes: focus moves on to the act now open (or the panel's heading),
    // never to the page's top.
    requestAnimationFrame(() => {
      const lost = document.activeElement;
      if (lost && lost !== document.body && lost.isConnected) return;
      const nextAct = document.getElementById("admission-next") ?? document.getElementById("travel-next");
      (nextAct?.querySelector<HTMLElement>("select,input,textarea,button") ?? document.getElementById(`${id}-title`))?.focus();
    });
    return true;
  }, [mutate, read, id]);

  if (view === undefined) return null;
  // A view that could not be read leaves Operations' travel act standing: it does not depend on the reservation.
  if (view === null) return (
    <section id="admission-panel" aria-labelledby={`${id}-title`} className="card p-5"><h3 id={`${id}-title`} className="title text-base">{t.title}</h3><p role="alert" className="mt-2 text-[0.875rem] text-alert-800">{t.loadFailed}</p>
      {role === "operations" && travel && <div className="mt-3 border-t border-line pt-3">{travel(caseStatus === "TRAVEL_COORDINATION")}</div>}
    </section>
  );

  const reserved = !!view.admissionId;
  const voucher = view.voucher ?? null;
  const openRows = view.evidence.filter(row => !row.superseded);
  const pendingLetter = role === "finance" && LETTER_DECIDABLE.has(view.letterCheck ?? "")
    ? openRows.find(row => row.kind === "FACILITY_ADMISSION_LETTER" && !row.countersignedAt) ?? null : null;
  const toCountersign = role === "finance" ? openRows.filter(row => COUNTERSIGNED_HERE.has(row.kind) && !row.countersignedAt) : [];
  const feeOwed = (view.feeBalanceOwedEgp ?? 0) > 0;
  const appointmentSet = openRows.some(row => row.kind === "FIRST_CONFIRMED_APPOINTMENT");
  // The next thing this viewer does here: its form opens and carries the panel's one primary button.
  // Operations' acts in the order they happen. In travel coordination the backend's step names them (B-5-1): the reservation,
  // the letter (or the refused letter's own item), then the travel plan. After arrival a reservation or letter still missing
  // comes first, then what the step names. One stage for both: the view's own when a command has just moved it.
  const stage = view.caseStatus ?? caseStatus;
  const cleared = ["ADMISSION_READY", "TREATMENT_IN_PROGRESS"].includes(stage);
  const next = role === "operations"
    ? (stage === "TRAVEL_COORDINATION"
      ? (currentCode === "RESERVE_HOSPITAL" ? "reserve" : ["RECORD_ADMISSION_LETTER", "REVISE_ADMISSION_LETTER"].includes(currentCode ?? "") ? "letter" : travel ? "travel" : null)
      : !reserved && !cleared ? "reserve" : ["NONE", "REFUSED"].includes(view.letterCheck ?? "NONE") && !cleared ? "letter"
      : currentCode === "RECORD_HOSPITAL_BALANCE" ? "receipt" : currentCode === "RECORD_ADMISSION_NUMBER" ? "number" : null)
    // In treatment, Finance's current work may be the Treatment panel's (P1-16): this panel then leads only for its own work.
    : role === "finance" && (caseStatus !== "TREATMENT_IN_PROGRESS" || ADMISSION_WORK.has(currentCode ?? "")) ? (pendingLetter ? "decide" : toCountersign.length > 0 ? `countersign:${toCountersign[0].id}` : feeOwed ? "fee" : null)
    : null;
  const btn = (key: string) => next === key ? "btn-primary" : "btn-secondary";
  const voucherFacts = voucher && <VoucherFacts t={t} locale={locale} voucher={voucher} view={view} egp={egp}/>;

  // UX 3-2: the Consultant reads the admission as one line — where, and whether the hospital's letter is within the estimate —
  // with the money behind a disclosure (presentation only: what a Consultant may read is the backend's call). Their one act
  // here, the emergency admission, stays.
  if (role === "doctor") return (
    <section id="admission-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={`${id}-title`} className="title text-base">{t.summary.title}</h3>
        {view.admissionStatus && <StatusBadge tone={view.admissionStatus === "CANCELLED" ? "neutral" : view.admissionStatus === "RESERVED" ? "info" : "success"}>{pick(t.admissionStatus, view.admissionStatus)}</StatusBadge>}
      </div>
      {!reserved ? <p className="mt-1 text-[0.875rem] text-ink-600">{t.notReserved}</p> : (
        <p className="mt-1 text-[0.875rem] text-ink-700">
          <bdi className="font-semibold text-ink-900">{view.facilityName ?? "—"}</bdi>{view.facilityCity && <> · <bdi>{view.facilityCity}</bdi></>}
          {" · "}<span className={letterTone(view.letterCheck) === "warning" ? "text-alert-800" : undefined}>{pick(t.letterCheck, view.letterCheck ?? "NONE")}</span>
          {view.admissionNumber && <> · {t.admissionNumber} <bdi dir="ltr">{view.admissionNumber}</bdi></>}
        </p>
      )}
      {!cleared && view.admissionBlockers.length > 0 && (
        <p className="mt-1 text-[0.875rem] text-ink-600">{t.summary.waiting} {view.admissionBlockers.map(code => pick(t.checklist.blockers, code)).join(" · ")}</p>
      )}
      {view.emergencyOverride && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.emergencyRecorded}</p>}
      {voucherFacts && (
        <details className="group mt-3 border-t border-line">
          <Summary>{t.summary.money}</Summary>
          <div className="pb-2">{voucherFacts}</div>
        </details>
      )}
      {caseStatus === "ARRIVAL_CONFIRMED" && !view.emergencyOverride && <EmergencyAdmission t={t} busy={busy}
        onRecord={reason => act(`/doctor/cases/${caseId}/emergency-admission`, { reason })}/>}
      {/* B-3-1b: after the emergency admission the Consultant records the hospital's number, which starts treatment. */}
      {caseStatus === "ADMISSION_READY" && view.emergencyOverride && (
        <ActForm className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3" refused={t.forms.refused} retry={t.forms.refusedRetry} confirm={numberConfirm(t)}
          action={data => act(`/doctor/cases/${caseId}/admission/number`, { admissionNumber: String(data.get("admissionNumber") ?? "").trim() })}>
          <p id={`${id}-number-hint`} className="w-full max-w-[65ch] text-[0.875rem] text-ink-600">{t.summary.emergencyNumber}</p>
          <label className="block text-sm font-semibold">{t.forms.numberField}<input className="field" name="admissionNumber" maxLength={80} required autoComplete="off" spellCheck={false} dir="ltr" aria-describedby={`${id}-number-hint`}/></label>
          <button className="btn-primary" disabled={busy}>{t.forms.number}</button>
        </ActForm>
      )}
    </section>
  );

  return (
    <section id="admission-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
        {view.admissionStatus && <StatusBadge tone={view.admissionStatus === "CANCELLED" ? "neutral" : view.admissionStatus === "RESERVED" ? "info" : "success"}>{pick(t.admissionStatus, view.admissionStatus)}</StatusBadge>}
      </div>

      {/* UX 5-2/5-3: at the cashier Operations reads one line, what the patient pays, above the file that records it; every
          other figure is one click away. */}
      {role === "operations" && voucher && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[0.9375rem] font-semibold text-ink-900">{fillTemplate(t.money.patientPaysLine, { amount: isolate(egp(voucher.patientPaysAtFacilityEgp)) })}
            {voucher.displayCurrency && voucher.displayCurrency !== "EGP" && voucher.patientPaysAtFacilityDisplay != null && <span className="font-normal text-ink-600"> · <Money>{formatMoney(voucher.patientPaysAtFacilityDisplay, voucher.displayCurrency, locale)}</Money></span>}</p>
          <details className="group"><Summary>{t.summary.money}</Summary><div className="pb-2">{voucherFacts}</div></details>
        </div>
      )}
      {role === "operations" ? <>
        <OperationsFile t={t} locale={locale} view={view} caseId={caseId} caseStatus={stage} next={next} documents={documents} facilities={facilities} busy={busy} act={act}
          travel={travel} day={day} egp={egp}/>
        {(view.letterReferenceMaxEgp != null || view.pointOfNoReturnAt) && (
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-3">
            {view.letterReferenceMaxEgp != null && <Fact label={t.referenceMax}><Money>{egp(view.letterReferenceMaxEgp)}</Money></Fact>}
            {view.pointOfNoReturnAt && <Fact label={t.pointOfNoReturn}>{when(view.pointOfNoReturnAt)} <span className="font-normal text-ink-600">· {view.pointOfNoReturnApproved ? t.pnrApproved : t.pnrPending}</span></Fact>}
          </dl>
        )}
      </> : !reserved ? <p className="mt-2 text-[0.875rem] text-ink-600">{t.notReserved}</p> : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t.facility}><bdi>{view.facilityName ?? "—"}</bdi>{view.facilityCity && <span className="font-normal text-ink-600"> · <bdi>{view.facilityCity}</bdi></span>}</Fact>
          <Fact label={t.plannedAt}>{when(view.plannedAdmissionAt)}</Fact>
          <Fact label={t.letter}><span className={letterTone(view.letterCheck) === "warning" ? "text-alert-800" : undefined}>{pick(t.letterCheck, view.letterCheck ?? "NONE")}</span></Fact>
          {view.letterReferenceMaxEgp != null && <Fact label={t.referenceMax}><Money>{egp(view.letterReferenceMaxEgp)}</Money></Fact>}
          {view.pointOfNoReturnAt && <Fact label={t.pointOfNoReturn}>{when(view.pointOfNoReturnAt)} <span className="font-normal text-ink-600">· {view.pointOfNoReturnApproved ? t.pnrApproved : t.pnrPending}</span></Fact>}
          {view.admissionNumber && <Fact label={t.admissionNumber}><bdi dir="ltr">{view.admissionNumber}</bdi></Fact>}
        </dl>
      )}

      {!(role === "operations" && voucher) && (voucherFacts ? <div className="mt-4 border-t border-line pt-3">{voucherFacts}</div>
        : reserved && <p className="mt-4 border-t border-line pt-3 text-[0.875rem] text-ink-600">{t.noVoucher}</p>)}

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.checklist.title}</h4>
        {view.admissionBlockers.length === 0
          ? <p className="mt-1 text-[0.875rem] text-ink-700">{t.checklist.clear}</p>
          : <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[0.875rem] text-ink-700">{view.admissionBlockers.map(code => <li key={code}>{pick(t.checklist.blockers, code)}</li>)}</ul>}
        {view.emergencyOverride && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.emergencyRecorded}</p>}
      </div>

      {/* Operations' side tasks: none is a step of its own, so none carries the filled button. */}
      {role === "operations" && (
        <div className="mt-2">
          {reserved && !voucher && (
            <Task title={t.forms.voucher} next={false}>
              <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.forms.voucherHint}</p>
              <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={() => void act(`/operations/cases/${caseId}/admission/voucher`)}>{t.forms.voucher}</button>
            </Task>
          )}
          {reserved && !cleared && !view.pointOfNoReturnApproved && (
            <Task title={t.forms.pnr} next={false}>
              <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.forms.pnrHint}</p>
              <ActForm className="mt-3 flex flex-col items-start gap-3" refused={t.forms.refused} retry={t.forms.refusedRetry}
                confirm={{ title: data => fillTemplate(t.forms.pnrConfirm, { time: isolate(when(instant(data.get("at")))) }), body: t.forms.pnrHint, confirm: t.forms.pnr, cancel: t.cancel }}
                action={data => act(`/operations/cases/${caseId}/admission/point-of-no-return`, { at: instant(data.get("at")) })}>
                <TimeField label={t.forms.pnrAt} name="at" hint={t.forms.timeHint}/>
                <button className="btn-secondary" disabled={busy}>{t.forms.pnr}</button>
              </ActForm>
            </Task>
          )}
        </div>
      )}

      {role === "finance" && (
        <div className="mt-2">
          {pendingLetter && <LetterDecision key={pendingLetter.id} t={t} letter={pendingLetter} variance={view.letterCheck === "VARIANCE_OPEN"} referenceMax={view.letterReferenceMaxEgp}
            egp={egp} busy={busy} primary={next === "decide"} onDecide={(decision, note) => act(`/finance/cases/${caseId}/admission/letter/decision`, { evidenceId: pendingLetter.id, decision, note })}/>}
          {toCountersign.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <h4 className="text-[0.875rem] font-bold text-ink-800">{t.finance.toCountersign}</h4>
              <ul className="mt-1.5 divide-y divide-line">
                {toCountersign.map(row => <Countersign key={row.id} t={t} row={row} when={when} egp={egp} busy={busy} primary={next === `countersign:${row.id}`}
                                                       onConfirm={() => act(`/finance/cases/${caseId}/evidence/${row.id}/countersign`)}/>)}
              </ul>
            </div>
          )}
          {feeOwed && (
            <Task title={t.finance.feeTitle} next={next === "fee"}>
              <ActForm className="grid gap-3 sm:grid-cols-3" refused={t.forms.refused} retry={t.forms.refusedRetry} action={data => act(`/finance/cases/${caseId}/admission/fee-balance`, { reference: String(data.get("reference") ?? "").trim(), amountEgp: Number(data.get("amountEgp")), receivedAt: instant(data.get("receivedAt")) })}>
                <label className="block text-sm font-semibold">{t.finance.reference}<input className="field" name="reference" maxLength={160} required autoComplete="off" spellCheck={false} dir="ltr"/></label>
                <label className="block text-sm font-semibold">{t.forms.amountEgp}<input className="field" name="amountEgp" type="number" inputMode="decimal" min="0.01" step="0.01" required dir="ltr" defaultValue={view.feeBalanceOwedEgp ?? undefined}/></label>
                <TimeField label={t.finance.receivedAt} name="receivedAt" hint={t.forms.timeHint}/>
                <p className="text-[0.8125rem] text-ink-500 sm:col-span-3">{t.finance.freshSignIn}</p>
                <div className="sm:col-span-3"><button className={btn("fee")} disabled={busy}>{t.finance.recordFee}</button></div>
              </ActForm>
            </Task>
          )}
        </div>
      )}

      {/* The first appointment sets the refund cutoff: Operations meets it before admission, not at every stage after. */}
      {(role === "coordinator" || (role === "operations" && !cleared)) && (
        <Task title={appointmentSet ? t.firstAppointment.correct : t.firstAppointment.title} next={false}>
          <p className="mb-3 max-w-[65ch] text-[0.875rem] text-ink-600">{t.firstAppointment.hint}</p>
          <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} action={data => act(`/cases/${caseId}/first-confirmed-appointment`, { appointmentDate: text(data.get("appointmentDate")), reason: text(data.get("reason")) })}>
            <label className="block text-sm font-semibold">{t.firstAppointment.date}<input className="field" name="appointmentDate" type="date" required dir="ltr"/></label>
            <label className="block text-sm font-semibold">{t.firstAppointment.reason}<input className="field" name="reason" maxLength={500} required dir="auto"/></label>
            <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{appointmentSet ? t.firstAppointment.correct : t.firstAppointment.record}</button></div>
          </ActForm>
        </Task>
      )}

      <details className="group mt-3 border-t border-line pt-1">
        <Summary>{t.trail.title} ({view.evidence.length})</Summary>
        {view.evidence.length === 0 ? <p className="pb-2 text-[0.875rem] text-ink-500">{t.trail.empty}</p> : (
          <ol className="divide-y divide-line text-[0.875rem]">
            {view.evidence.map(row => (
              <li key={row.id} className={`py-2 ${row.superseded ? "text-ink-500" : "text-ink-800"}`}>
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-semibold">{pick(t.trail.kinds, row.kind)}{row.amountEgp != null && <> · <Money>{egp(row.amountEgp)}</Money></>}{row.reference && <> · <bdi dir="ltr">{row.reference}</bdi></>}</span>
                  <span className="text-ink-500">{when(row.effectiveAt ?? row.recordedAt)}</span>
                </p>
                <p className="text-[0.8125rem] text-ink-600">
                  {fillTemplate(t.trail.recorded, { role: pick(t.trail.roles, row.recordedRole ?? "SYSTEM") })} · {when(row.recordedAt)}
                  {" · "}{row.countersignedAt ? `${fillTemplate(t.trail.countersigned, { role: pick(t.trail.roles, row.countersignedRole ?? "FINANCE") })} · ${when(row.countersignedAt)}` : t.trail.awaiting}
                  {row.superseded && <> · <strong className="font-semibold">{t.trail.superseded}</strong></>}
                </p>
              </li>
            ))}
          </ol>
        )}
      </details>
    </section>
  );
}

/**
 * UX 5-1: Operations' hospital file — the acts in the order they happen: reserve the hospital, record its admission letter,
 * travel and the arrival (the page's travel act), the cashier's receipt, the admission number. A done act is one line (with its
 * correction behind a disclosure while it still takes one); only the current act is open, carrying the view's one filled button;
 * a later act is named so the order is plain. Presentation only: the backend decides every rule.
 */
function OperationsFile({ t, locale, view, caseId, caseStatus, next, documents, facilities, busy, act, travel, day, egp }: {
  t: Copy; locale: Locale; view: AdmissionView; caseId: string; caseStatus: string; next: string | null; documents: Doc[]; facilities: DirectoryFacility[]; busy: boolean;
  act: (path: string, body?: unknown) => Promise<boolean>; travel?: (current: boolean) => ReactNode; day: Intl.DateTimeFormat; egp: (n?: number | null) => string;
}) {
  const id = useId();
  // The cashier records a payment that has just happened: "paid at" starts at now, and moves on to now each time the
  // officer comes back to the receipt while nobody has changed it (so a file left open never records an old time).
  const [openedAt] = useState(() => localInput(new Date().toISOString()));
  const [paidIn, setPaidIn] = useState("");
  const freshPaidAt = (event: FocusEvent<HTMLFormElement>) => {
    const at = event.currentTarget.elements.namedItem("paidAt");
    if (!(at instanceof HTMLInputElement) || (event.target as EventTarget) === at || at.value !== at.defaultValue) return;
    at.defaultValue = at.value = localInput(new Date().toISOString());
  };
  const reserved = !!view.admissionId;
  const cleared = ["ADMISSION_READY", "TREATMENT_IN_PROGRESS"].includes(caseStatus);
  const letterOwed = ["NONE", "REFUSED"].includes(view.letterCheck ?? "NONE");
  const receipt = view.evidence.find(row => row.kind === "BALANCE_EVIDENCED" && !row.superseded) ?? null;
  const owed = view.balanceOwedEgp ?? 0;
  const receiptOpen = !receipt && !!view.voucher && owed > 0;
  const btn = (key: string) => next === key ? "btn-primary" : "btn-secondary";
  const travelNode = travel?.(next === "travel");
  // The patient's own currency first, then the platform's other rated currencies.
  const currencies = [...new Set([view.voucher?.displayCurrency, ...Object.keys(CURRENCY_LABELS)])].filter((code): code is string => !!code && code !== "EGP");
  // Recording the number on a cleared case starts treatment, so it asks first; a correction does not.
  const numberStarts = caseStatus === "ADMISSION_READY" && !view.admissionNumber;

  const reserveForm = (
    <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} action={data => act(`/operations/cases/${caseId}/admission`, { facilityId: data.get("facilityId"), plannedAdmissionAt: instant(data.get("plannedAdmissionAt")) })}>
      <div>
        <label htmlFor={`${id}-hospital`} className="block text-sm font-semibold">{t.facility}</label>
        <select id={`${id}-hospital`} className="field" name="facilityId" required defaultValue={view.facilityId ?? ""} aria-describedby={facilities.length === 0 ? `${id}-no-hospitals` : undefined}>
          <option value="">{t.forms.chooseFacility}</option>
          {facilities.map(f => <option key={f.id} value={f.id}>{fillTemplate(t.forms.hospitalOption, { name: isolate(f.name), city: isolate(f.city) })}</option>)}
        </select>
        {facilities.length === 0 && <p id={`${id}-no-hospitals`} className="mt-1 text-[0.8125rem] text-ink-600">{t.forms.noHospitals}</p>}
      </div>
      <TimeField label={t.plannedAt} name="plannedAdmissionAt" hint={t.forms.timeHint} defaultValue={localInput(view.plannedAdmissionAt)}/>
      <div className="sm:col-span-2"><button className={btn("reserve")} disabled={busy}>{t.forms.saveReservation}</button></div>
    </ActForm>
  );
  const letterForm = (
    <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} action={data => act(`/operations/cases/${caseId}/admission/letter`, { documentId: data.get("documentId"), quotedPackageEgp: Number(data.get("quotedPackageEgp")), reference: text(data.get("reference")) })}>
      {view.letterCheck === "REFUSED" && <p className="text-[0.875rem] font-semibold text-alert-800 sm:col-span-2">{t.letterCheck.REFUSED}</p>}
      <DocumentPicker name="documentId" label={t.forms.document} empty={t.forms.chooseDocument} documents={documents} required/>
      <label className="block text-sm font-semibold">{t.forms.quoted}<input className="field" name="quotedPackageEgp" type="number" inputMode="decimal" min="0" step="0.01" required dir="ltr"/></label>
      <label className="block text-sm font-semibold">{t.forms.reference}<input className="field" name="reference" maxLength={160} autoComplete="off" spellCheck={false} dir="auto"/></label>
      {!documents.some(d => d.status === "CLEAN") && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{t.forms.noDocuments}</p>}
      <div className="sm:col-span-2"><button className={btn("letter")} disabled={busy}>{t.forms.recordLetter}</button></div>
    </ActForm>
  );
  // UX 5-2: on a phone at the cashier the receipt is four fields, the amount and the time already in them; another currency
  // and the copy are behind one disclosure.
  const receiptForm = (
    <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} onFocusCapture={freshPaidAt} action={data => act(`/operations/cases/${caseId}/admission/balance`, {
      receiptNumber: data.get("receiptNumber"), amountEgp: Number(data.get("amountEgp")), paidAt: instant(data.get("paidAt")), method: data.get("method"),
      documentId: data.get("documentId") || null, paidCurrency: text(data.get("paidCurrency")), paidAmount: data.get("paidAmount") ? Number(data.get("paidAmount")) : null })}>
      <label className="block text-sm font-semibold">{t.forms.receiptNumber}<input className="field" name="receiptNumber" maxLength={160} required autoComplete="off" spellCheck={false} dir="ltr"/></label>
      <div>
        <label htmlFor={`${id}-amount`} className="block text-sm font-semibold">{t.forms.amountEgp}</label>
        <input id={`${id}-amount`} className="field" name="amountEgp" type="number" inputMode="decimal" min="0.01" step="0.01" required dir="ltr"
               defaultValue={owed > 0 ? owed.toFixed(2) : undefined} aria-describedby={owed > 0 ? `${id}-amount-hint` : undefined}/>
        {owed > 0 && <p id={`${id}-amount-hint`} className="mt-1 text-[0.8125rem] text-ink-600">{fillTemplate(t.forms.amountHint, { amount: isolate(egp(owed)) })}</p>}
      </div>
      <TimeField label={t.forms.paidAt} name="paidAt" hint={t.forms.paidAtHint} defaultValue={openedAt}/>
      <label className="block text-sm font-semibold">{t.forms.method}
        <select className="field" name="method" defaultValue="CASH">{(["CASH", "CARD", "BANK_TRANSFER"] as const).map(m => <option key={m} value={m}>{t.forms.methods[m]}</option>)}</select>
      </label>
      {/* A field the browser refuses inside a closed disclosure could not be shown: the disclosure opens for it. */}
      <details className="group sm:col-span-2" onInvalidCapture={event => { event.currentTarget.open = true; }}>
        <Summary>{t.forms.otherCurrency}</Summary>
        <div className="grid gap-3 pb-1 sm:grid-cols-2">
          <label className="block text-sm font-semibold">{t.forms.paidCurrency}
            <select className="field" name="paidCurrency" value={paidIn} onChange={event => setPaidIn(event.target.value)}>
              <option value="">{t.forms.egpOnly}</option>
              {currencies.map(code => <option key={code} value={code}>{CURRENCY_LABELS[code]?.[locale] ?? code}</option>)}
            </select>
          </label>
          {/* A currency needs its amount: the two are recorded together. */}
          <label className="block text-sm font-semibold">{t.forms.paidAmount}<input className="field" name="paidAmount" type="number" inputMode="decimal" min="0.01" step="0.01" dir="ltr" required={!!paidIn}/></label>
          <DocumentPicker name="documentId" label={t.forms.receiptDocument} empty={t.forms.none} documents={documents}/>
        </div>
      </details>
      <div className="sm:col-span-2"><button className={btn("receipt")} disabled={busy}>{t.forms.recordReceipt}</button></div>
    </ActForm>
  );
  const numberForm = (
    <ActForm className="flex flex-wrap items-end gap-3" refused={t.forms.refused} retry={t.forms.refusedRetry} confirm={numberStarts ? numberConfirm(t) : undefined}
      action={data => act(`/operations/cases/${caseId}/admission/number`, { admissionNumber: String(data.get("admissionNumber") ?? "").trim() })}>
      <label className="block text-sm font-semibold">{t.forms.numberField}<input className="field" name="admissionNumber" maxLength={80} required autoComplete="off" spellCheck={false} dir="ltr" defaultValue={view.admissionNumber ?? ""} aria-describedby={numberStarts ? `${id}-number-hint` : undefined}/></label>
      <button className={btn("number")} disabled={busy}>{view.admissionNumber ? t.forms.saveNumber : t.forms.number}</button>
      {numberStarts && <p id={`${id}-number-hint`} className="w-full text-[0.8125rem] text-ink-600">{t.forms.numberHint}</p>}
    </ActForm>
  );
  // Name and city each isolated: an Arabic name with a Latin city keeps each in its own direction.
  const hospital = !view.facilityName ? "—" : view.facilityCity ? fillTemplate(t.forms.hospitalOption, { name: isolate(view.facilityName), city: isolate(view.facilityCity) }) : isolate(view.facilityName);
  const letterWaits = view.letterCheck === "CHECK_PENDING" || view.letterCheck === "VARIANCE_OPEN";
  // A task brings its own rule; a done or later act takes one, so each act is ruled once.
  const ruled = (task: boolean) => task ? undefined : "border-t border-line";

  return (
    <ol aria-label={t.acts.title} className="mt-3 border-b border-line">
      {(reserved || !cleared) && <li className={ruled(!reserved)}>{reserved
        ? <DoneAct fact={fillTemplate(t.acts.reserved, { hospital, date: isolate(view.plannedAdmissionAt ? day.format(new Date(view.plannedAdmissionAt)) : "—") })}
            change={!cleared ? t.forms.changeReservation : undefined}>{reserveForm}</DoneAct>
        : <Task title={t.forms.reserve} next={next === "reserve"}>{reserveForm}</Task>}</li>}
      {/* An emergency admission can clear a case before any letter: then there is no letter act to show. */}
      {!(cleared && letterOwed) && <li className={ruled(reserved && letterOwed)}>{!reserved ? <LaterAct notYet={t.acts.notYet}>{t.forms.letter}</LaterAct>
        : letterOwed ? <Task title={t.forms.letter} next={next === "letter"}>{letterForm}</Task>
        : <DoneAct tone={view.letterCheck === "VARIANCE_OPEN" ? "warning" : letterWaits ? "waiting" : "done"} fact={<>{t.letter} · <span className={letterTone(view.letterCheck) === "warning" ? "text-alert-800" : undefined}>{pick(t.letterCheck, view.letterCheck ?? "NONE")}</span></>}
            change={!cleared ? t.forms.newLetter : undefined}>{letterForm}</DoneAct>}</li>}
      {travelNode && <li className="border-t border-line py-2">{travelNode}</li>}
      {/* A cleared case without a receipt needed none (nothing was owed at the cashier). */}
      {(next === "receipt" || receipt || receiptOpen || !cleared) && <li className={ruled(next === "receipt" || receiptOpen)}>{next === "receipt" ? <Task title={t.forms.receipt} next>{receiptForm}</Task>
        : receipt ? <DoneAct tone={receipt.countersignedAt ? "done" : "waiting"} fact={<>{t.acts.receipt} · <Money>{egp(receipt.amountEgp)}</Money> · {receipt.countersignedAt ? t.acts.checked : t.acts.awaitingCheck}</>}
            change={!cleared && (view.balanceOwedEgp ?? 0) > 0 ? t.forms.anotherReceipt : undefined}>{receiptForm}</DoneAct>
        : receiptOpen ? <Task title={t.forms.receipt} next={false}>{receiptForm}</Task>
        : <LaterAct notYet={t.acts.notYet}>{t.forms.receipt}</LaterAct>}</li>}
      <li className={ruled(next === "number" || (cleared && !view.admissionNumber))}>{next === "number" ? <Task title={t.forms.number} next>{numberForm}</Task>
        : view.admissionNumber ? <DoneAct fact={<>{t.admissionNumber} <bdi dir="ltr">{view.admissionNumber}</bdi></>} change={cleared ? t.forms.correctNumber : undefined}>{numberForm}</DoneAct>
        : cleared ? <Task title={t.forms.number} next={false}>{numberForm}</Task>
        : <LaterAct notYet={t.acts.notYet}>{t.forms.number}</LaterAct>}</li>
    </ol>
  );
}

/** A name or date set inside a sentence of the other script, isolated so it never reorders its neighbours. */
const isolate = (value: string) => `⁨${value}⁩`;

/** The admission number starts treatment: the confirmation repeats the number typed and says what it moves. */
const numberConfirm = (t: Copy) => ({
  title: (data: FormData) => fillTemplate(t.forms.numberConfirm, { number: isolate(String(data.get("admissionNumber") ?? "").trim()) }),
  body: t.forms.numberConfirmBody, confirm: t.forms.number, cancel: t.cancel,
});

/** The frozen voucher: its number, what each side pays, what is still owed, and the rate it was frozen at. */
function VoucherFacts({ t, locale, voucher, view, egp }: { t: Copy; locale: Locale; voucher: NonNullable<AdmissionView["voucher"]>; view: AdmissionView; egp: (n?: number | null) => string }) {
  return (
    <>
      <p className="text-[0.875rem] text-ink-500">{t.voucher} <bdi dir="ltr" translate="no" className="font-bold text-ink-900">{voucher.voucherNumber}</bdi> · {fillTemplate(t.voucherRevision, { revision: String(voucher.revision) })}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-2 text-[0.875rem] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t.money.packageTotal}><Money>{egp(voucher.packageTotalEgp)}</Money></Fact>
        <Fact label={t.money.platformFee}><Money>{egp(voucher.platformFeeEgp)}</Money></Fact>
        <Fact label={t.money.depositPaid}><Money>{egp(voucher.depositPaidEgp)}</Money></Fact>
        <Fact label={t.money.depositCredit}><Money>{egp(voucher.depositCreditEgp)}</Money></Fact>
        <Fact label={t.money.patientPays}><Money>{egp(voucher.patientPaysAtFacilityEgp)}</Money>
          {voucher.displayCurrency && voucher.displayCurrency !== "EGP" && voucher.patientPaysAtFacilityDisplay != null && <span className="font-normal text-ink-600"> · <Money>{formatMoney(voucher.patientPaysAtFacilityDisplay, voucher.displayCurrency, locale)}</Money></span>}</Fact>
        {voucher.feeBalanceEgp > 0 && <Fact label={t.money.feeBalance}><Money>{egp(voucher.feeBalanceEgp)}</Money></Fact>}
        <Fact label={t.money.balanceOwed}><Money>{egp(view.balanceOwedEgp)}</Money></Fact>
        {(view.feeBalanceOwedEgp ?? 0) > 0 && <Fact label={t.money.feeBalanceOwed}><Money>{egp(view.feeBalanceOwedEgp)}</Money></Fact>}
      </dl>
      {voucher.fxRate != null && voucher.fxRateDate && (
        <p className="mt-2 text-[0.8125rem] text-ink-500">{fillTemplate(t.money.rate, { rate: `⁨${new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 6 }).format(voucher.fxRate)}⁩`,
          date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${voucher.fxRateDate}T00:00:00Z`)) })}</p>
      )}
    </>
  );
}

/** A recording task of this panel: its next one carries the panel's "do it" anchor. */
function Task({ title, next, children }: { title: string; next: boolean; children: ReactNode }) {
  return <PanelTask title={title} next={next} anchor="admission-next">{children}</PanelTask>;
}

function LetterDecision({ t, letter, variance, referenceMax, egp, busy, primary, onDecide }: {
  t: Copy; letter: AdmissionEvidence; variance: boolean; referenceMax?: number | null; egp: (n?: number | null) => string; busy: boolean; primary: boolean;
  onDecide: (decision: "ACCEPT" | "REFUSE", note: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  async function decide(decision: "ACCEPT" | "REFUSE") {
    const reason = note.trim();
    // A reason is owed for a price above the accepted estimate and for every refusal; the backend says so too.
    if (!reason && (decision === "REFUSE" || variance)) { setMissing(decision === "REFUSE" ? t.finance.refuseNoteRequired : t.finance.noteRequired); document.getElementById(`${id}-note`)?.focus(); return; }
    setMissing(null);
    if (await onDecide(decision, reason || null)) setNote("");
  }
  return (
    <div id={primary ? "admission-next" : undefined} className="mt-3 border-t border-line pt-3">
      <h4 className="text-[0.875rem] font-bold text-ink-800">{t.finance.letterTitle}</h4>
      <dl className="mt-1.5 grid gap-x-6 gap-y-1 text-[0.875rem] tabular-nums sm:grid-cols-2">
        <Fact label={t.finance.quoted}><Money>{egp(letter.amountEgp)}</Money>{letter.reference && <span className="font-normal text-ink-600"> · <bdi dir="ltr">{letter.reference}</bdi></span>}</Fact>
        {referenceMax != null && <Fact label={t.referenceMax}><Money>{egp(referenceMax)}</Money></Fact>}
      </dl>
      {variance && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.letterCheck.VARIANCE_OPEN}</p>}
      <label htmlFor={`${id}-note`} className="mt-3 block text-sm font-semibold">{t.finance.note}</label>
      <textarea id={`${id}-note`} className="field" rows={2} maxLength={2000} value={note} onChange={event => { setNote(event.target.value); if (missing) setMissing(null); }}
                aria-invalid={missing ? true : undefined} aria-describedby={missing ? `${id}-missing` : undefined}/>
      {missing && <p id={`${id}-missing`} role="alert" className="mt-1 text-[0.8125rem] font-semibold text-alert-800">{missing}</p>}
      <p className="mt-1 text-[0.8125rem] text-ink-500">{t.finance.freshSignIn}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={primary ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={() => void decide("ACCEPT")}>{t.finance.accept}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void decide("REFUSE")}>{t.finance.refuse}</button>
      </div>
    </div>
  );
}

function Countersign({ t, row, when, egp, busy, primary, onConfirm }: {
  t: Copy; row: AdmissionEvidence; when: (iso?: string | null) => string; egp: (n?: number | null) => string; busy: boolean; primary: boolean; onConfirm: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li id={primary ? "admission-next" : undefined} className="flex flex-wrap items-center justify-between gap-3 py-2 text-[0.875rem]">
      <span className="min-w-0">
        <span className="font-semibold text-ink-900">{pick(t.trail.kinds, row.kind)}</span>
        {row.amountEgp != null && <> · <Money>{egp(row.amountEgp)}</Money></>}
        {row.reference && <> · <bdi dir="ltr">{row.reference}</bdi></>}
        <span className="block text-[0.8125rem] text-ink-600">{fillTemplate(t.trail.recorded, { role: pick(t.trail.roles, row.recordedRole ?? "SYSTEM") })} · {when(row.effectiveAt ?? row.recordedAt)}</span>
      </span>
      <button type="button" className={primary ? "btn-primary" : "btn-secondary"} disabled={busy} onClick={() => setConfirming(true)}>{t.finance.countersign}<span className="sr-only">: {pick(t.trail.kinds, row.kind)}</span></button>
      {confirming && <ConfirmDialog title={t.finance.countersignTitle} body={t.finance.countersignBody} confirm={t.finance.countersign} cancel={t.cancel}
                                    onConfirm={() => { setConfirming(false); void onConfirm(); }} onCancel={() => setConfirming(false)}/>}
    </li>
  );
}

function EmergencyAdmission({ t, busy, onRecord }: { t: Copy; busy: boolean; onRecord: (reason: string) => Promise<boolean> }) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  return (
    <details className="group mt-3 border-t border-line">
      <Summary>{t.emergency.title}</Summary>
      <form className="pb-3" onSubmit={event => { event.preventDefault(); if (reason.trim()) setConfirming(true); }}>
        <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.emergency.body}</p>
        <label htmlFor={`${id}-reason`} className="mt-3 block text-sm font-semibold">{t.emergency.reason}</label>
        <textarea id={`${id}-reason`} className="field" rows={3} maxLength={4000} required value={reason} onChange={event => setReason(event.target.value)}/>
        <button className="btn-secondary mt-3" disabled={busy}>{t.emergency.record}</button>
      </form>
      {confirming && <ConfirmDialog title={t.emergency.confirmTitle} body={t.emergency.confirmBody} confirm={t.emergency.record} cancel={t.cancel}
                                    onConfirm={() => { setConfirming(false); void onRecord(reason.trim()).then(done => { if (done) setReason(""); }); }} onCancel={() => setConfirming(false)}/>}
    </details>
  );
}

function letterTone(check?: string | null): StatusTone { return check === "VARIANCE_OPEN" || check === "REFUSED" ? "warning" : "neutral"; }

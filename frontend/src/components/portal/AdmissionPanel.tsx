"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Clock } from "lucide-react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { ActForm, AmountInput, DocumentPicker, DoneAct, Fact, LaterAct, Money, ReasonField, Summary, Task as PanelTask, TimeField, instant, localInput, pick, quotedRate, readAmount, text, type PanelDocument } from "@/components/portal/panel-parts";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import { CURRENCY_LABELS, type AdmissionEvidence, type AdmissionView, type DirectoryFacility, type Mutate } from "@/components/portal/portal-model";

type Copy = LocalizedWorkCopy["admission"];
type Doc = PanelDocument;
export type AdmissionRole = "operations" | "finance" | "coordinator" | "doctor";

/** The case stages the panel belongs to (P1-15): from travel coordination, where Operations reserves, to treatment. */
export const ADMISSION_STAGES: ReadonlySet<string> = new Set(["TRAVEL_COORDINATION", "ARRIVAL_CONFIRMED", "ADMISSION_READY", "TREATMENT_IN_PROGRESS"]);
/** Current actions and work types whose work is done in this panel, so "do it" lands on its next form. */
export const ADMISSION_WORK: ReadonlySet<string> = new Set(["RECORD_HOSPITAL_BALANCE", "RECORD_ADMISSION_NUMBER", "CHECK_PROFORMA", "PRICE_VARIANCE",
  "REVISE_ADMISSION_LETTER", "COUNTERSIGN_BALANCE", "APPROVE_POINT_OF_NO_RETURN", "EMERGENCY_ADMISSION_REVIEW", "ADMISSION_VOUCHER_BLOCKED",
  "RECORD_FEE_BALANCE"]);
/** Ledger rows Finance countersigns from here (a letter is countersigned by its own decision). */
const COUNTERSIGNED_HERE = new Set(["BALANCE_EVIDENCED", "POINT_OF_NO_RETURN"]);
const LETTER_DECIDABLE = new Set(["CHECK_PENDING", "VARIANCE_OPEN"]);
/** Admission blockers that are acts of Operations' own file (the voucher, the receipt, the number). */
const OPERATIONS_CLEARS = new Set(["VOUCHER_NOT_ISSUED", "BALANCE_NOT_EVIDENCED", "ADMISSION_NUMBER_MISSING"]);
/** A letter Finance has checked: the voucher can be issued by hand from here. */
const LETTER_CHECKED = new Set(["WITHIN_ESTIMATE", "VARIANCE_ACCEPTED"]);
/** A letter Finance has decided either way: one line among what is checked. */
const LETTER_DONE = new Set([...LETTER_CHECKED, "REFUSED"]);

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
      const nextAct = document.getElementById("admission-next") ?? document.getElementById("travel-plan-next") ?? document.getElementById("travel-arrival-next");
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
  // UX 5-4: the blockers Operations cannot clear itself; the ones it clears are the file's own acts. A balance with its receipt
  // recorded and not yet countersigned waits on Finance, not on Operations.
  const hasReceipt = openRows.some(row => row.kind === "BALANCE_EVIDENCED" && !row.countersignedAt);
  const waitingOnOthers = view.admissionBlockers.filter(code => code === "BALANCE_NOT_EVIDENCED" ? hasReceipt : !OPERATIONS_CLEARS.has(code));
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
    : role === "finance" && (caseStatus !== "TREATMENT_IN_PROGRESS" || ADMISSION_WORK.has(currentCode ?? "")) ? (pendingLetter ? "decide" : toCountersign.length > 0 ? `countersign:${toCountersign[0].id}` : feeOwed && currentCode === "RECORD_FEE_BALANCE" ? "fee" : null)
    : null;
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
          other figure is one click away (UX 5-4: under the voucher's line in the file). The line asks for money only while the
          cashier is still owed it and no receipt waits on Finance. */}
      {role === "operations" && voucher && (view.balanceOwedEgp ?? 0) > 0 && !hasReceipt && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[0.9375rem] font-semibold text-ink-900">{fillTemplate(t.money.patientPaysLine, { amount: isolate(egp(voucher.patientPaysAtFacilityEgp)) })}
            {voucher.displayCurrency && voucher.displayCurrency !== "EGP" && voucher.patientPaysAtFacilityDisplay != null && <span className="font-normal text-ink-600"> · <Money>{formatMoney(voucher.patientPaysAtFacilityDisplay, voucher.displayCurrency, locale)}</Money></span>}</p>
        </div>
      )}
      {role === "operations" ? <>
        <OperationsFile t={t} locale={locale} view={view} caseId={caseId} caseStatus={stage} next={next} documents={documents} facilities={facilities} busy={busy} act={act}
          travel={travel} day={day} when={when} egp={egp} money={voucherFacts}
          appointment={reserved && !cleared && !appointmentSet ? <FirstAppointment t={t} caseId={caseId} set={false} busy={busy} act={act}/> : null}/>
        {/* UX 5-4: the file is Operations' checklist; what stands before admission and is someone else's to clear is said once. */}
        {!cleared && waitingOnOthers.length > 0 && (
          <div className="mt-3">
            <h4 id={`${id}-waiting`} className="flex items-start gap-2 text-[0.875rem] font-bold text-ink-800"><Clock size={16} aria-hidden className="mt-0.5 flex-none text-ink-500"/>{t.acts.waitingOn}</h4>
            <ul aria-labelledby={`${id}-waiting`} className="mt-1 list-disc space-y-1 ps-6 text-[0.875rem] text-ink-700">{waitingOnOthers.map(code => <li key={code}>{pick(t.checklist.blockers, code)}</li>)}</ul>
          </div>
        )}
        {view.emergencyOverride && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.emergencyRecorded}</p>}
        {/* The record — the first appointment and the evidence trail — behind one disclosure. */}
        {view.evidence.length > 0 && (
          <details className="group mt-1">
            <Summary>{t.acts.history} ({view.evidence.length})</Summary>
            {!cleared && appointmentSet && <FirstAppointment t={t} caseId={caseId} set busy={busy} act={act}/>}
            <Trail t={t} evidence={view.evidence} when={when} egp={egp}/>
          </details>
        )}
      </> : role === "finance" ? (
        <FinanceFile t={t} locale={locale} view={view} caseId={caseId} next={next} busy={busy} act={act} when={when} egp={egp} money={voucherFacts}
          pendingLetter={pendingLetter} toCountersign={toCountersign} cleared={cleared}/>
      ) : !reserved ? <p className="mt-2 text-[0.875rem] text-ink-600">{t.notReserved}</p> : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t.facility}><bdi>{view.facilityName ?? "—"}</bdi>{view.facilityCity && <span className="font-normal text-ink-600"> · <bdi>{view.facilityCity}</bdi></span>}</Fact>
          <Fact label={t.plannedAt}>{when(view.plannedAdmissionAt)}</Fact>
          <Fact label={t.letter}><span className={letterTone(view.letterCheck) === "warning" ? "text-alert-800" : undefined}>{pick(t.letterCheck, view.letterCheck ?? "NONE")}</span></Fact>
          {view.letterReferenceMaxEgp != null && <Fact label={t.referenceMax}><Money>{egp(view.letterReferenceMaxEgp)}</Money></Fact>}
          {view.pointOfNoReturnAt && <Fact label={t.pointOfNoReturn}>{when(view.pointOfNoReturnAt)} <span className="font-normal text-ink-600">· {view.pointOfNoReturnApproved ? t.pnrApproved : t.pnrPending}</span></Fact>}
          {view.admissionNumber && <Fact label={t.admissionNumber}><bdi dir="ltr">{view.admissionNumber}</bdi></Fact>}
        </dl>
      )}

      {role === "coordinator" && <>
        {voucherFacts ?<div className="mt-4 border-t border-line pt-3">{voucherFacts}</div>
          : reserved && <p className="mt-4 border-t border-line pt-3 text-[0.875rem] text-ink-600">{t.noVoucher}</p>}

        <div className="mt-4 border-t border-line pt-3">
          <h4 className="text-[0.875rem] font-bold text-ink-800">{t.checklist.title}</h4>
          {view.admissionBlockers.length === 0
            ? <p className="mt-1 text-[0.875rem] text-ink-700">{t.checklist.clear}</p>
            : <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[0.875rem] text-ink-700">{view.admissionBlockers.map(code => <li key={code}>{pick(t.checklist.blockers, code)}</li>)}</ul>}
          {view.emergencyOverride && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.emergencyRecorded}</p>}
        </div>
      </>}

      {role === "coordinator" && <FirstAppointment t={t} caseId={caseId} set={appointmentSet} busy={busy} act={act}/>}

      {role === "coordinator" && (
        <details className="group mt-3 border-t border-line pt-1">
          <Summary>{t.trail.title} ({view.evidence.length})</Summary>
          <Trail t={t} evidence={view.evidence} when={when} egp={egp}/>
        </details>
      )}
    </section>
  );
}

/**
 * UX 5-1: Operations' hospital file — the acts in the order they happen: reserve the hospital, record its admission letter,
 * travel and the arrival (the page's travel act), the cashier's receipt, the admission number. A done act is one line (with its
 * correction behind a disclosure while it still takes one); only the current act is open, carrying the view's one filled button;
 * a later act is named so the order is plain. Presentation only: the backend decides every rule.
 */
function OperationsFile({ t, locale, view, caseId, caseStatus, next, documents, facilities, busy, act, travel, day, when, egp, appointment, money }: {
  t: Copy; locale: Locale; view: AdmissionView; caseId: string; caseStatus: string; next: string | null; documents: Doc[]; facilities: DirectoryFacility[]; busy: boolean;
  act: (path: string, body?: unknown) => Promise<boolean>; travel?: (current: boolean) => ReactNode; day: Intl.DateTimeFormat; when: (iso?: string | null) => string; egp: (n?: number | null) => string;
  /** UX 5-4: the first confirmed appointment while it is still owed (it sets the refund cutoff). */ appointment: ReactNode;
  /** The voucher's money, behind the voucher's own line. */ money: ReactNode;
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
    <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} action={data => act(`/operations/cases/${caseId}/admission/letter`, { documentId: data.get("documentId"), quotedPackageEgp: readAmount(data.get("quotedPackageEgp")), reference: text(data.get("reference")) })}>
      {view.letterCheck === "REFUSED" && <p className="text-[0.875rem] font-semibold text-alert-800 sm:col-span-2">{t.letterCheck.REFUSED}</p>}
      <DocumentPicker name="documentId" label={t.forms.document} empty={t.forms.chooseDocument} documents={documents} required/>
      <div>
        <label htmlFor={`${id}-quoted`} className="block text-sm font-semibold">{t.forms.quoted}</label>
        <AmountInput id={`${id}-quoted`} name="quotedPackageEgp" invalid={t.forms.amountInvalid} describedBy={view.letterReferenceMaxEgp != null ? `${id}-quoted-hint` : undefined}/>
        {/* UX 5-4: the estimate the letter is checked against, where the price is typed (was a fact below the file). */}
        {view.letterReferenceMaxEgp != null && <p id={`${id}-quoted-hint`} className="mt-1 text-[0.8125rem] text-ink-600">{fillTemplate(t.forms.quotedHint, { amount: isolate(egp(view.letterReferenceMaxEgp)) })}</p>}
      </div>
      <label className="block text-sm font-semibold">{t.forms.reference}<input className="field" name="reference" maxLength={160} autoComplete="off" spellCheck={false} dir="auto"/></label>
      {!documents.some(d => d.status === "CLEAN") && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{t.forms.noDocuments}</p>}
      <div className="sm:col-span-2"><button className={btn("letter")} disabled={busy}>{t.forms.recordLetter}</button></div>
    </ActForm>
  );
  // UX 5-2: on a phone at the cashier the receipt is four fields, the amount and the time already in them; another currency
  // and the copy are behind one disclosure.
  const receiptForm = (
    <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} onFocusCapture={freshPaidAt} action={data => act(`/operations/cases/${caseId}/admission/balance`, {
      receiptNumber: data.get("receiptNumber"), amountEgp: readAmount(data.get("amountEgp")), paidAt: instant(data.get("paidAt")), method: data.get("method"),
      documentId: data.get("documentId") || null, paidCurrency: text(data.get("paidCurrency")), paidAmount: data.get("paidAmount") ? Number(data.get("paidAmount")) : null })}>
      <label className="block text-sm font-semibold">{t.forms.receiptNumber}<input className="field" name="receiptNumber" maxLength={160} required autoComplete="off" spellCheck={false} dir="ltr"/></label>
      <div>
        <label htmlFor={`${id}-amount`} className="block text-sm font-semibold">{t.forms.amountEgp}</label>
        <AmountInput id={`${id}-amount`} name="amountEgp" invalid={t.forms.amountInvalid} defaultValue={owed > 0 ? owed : undefined} describedBy={owed > 0 ? `${id}-amount-hint` : undefined}/>
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
  // UX 5-4: the voucher is issued on its own once the letter is checked and any final quote accepted; by hand it is an act only
  // when that is possible now (the backend refuses it otherwise), and a later act until then.
  const voucherNow = reserved && LETTER_CHECKED.has(view.letterCheck ?? "") && !view.admissionBlockers.includes("FINAL_QUOTE_NOT_ACCEPTED");
  // The point of no return is set once a hospital is reserved, and changed until Finance has approved it.
  const pnrForm = (
    <ActForm className="flex flex-col items-start gap-3" refused={t.forms.refused} retry={t.forms.refusedRetry}
      confirm={{ title: data => fillTemplate(t.forms.pnrConfirm, { time: isolate(when(instant(data.get("at")))) }), body: t.forms.pnrHint, confirm: t.forms.pnr, cancel: t.cancel }}
      action={data => act(`/operations/cases/${caseId}/admission/point-of-no-return`, { at: instant(data.get("at")) })}>
      <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.forms.pnrHint}</p>
      <TimeField label={t.forms.pnrAt} name="at" hint={t.forms.timeHint} defaultValue={localInput(view.pointOfNoReturnAt)}/>
      <button className="btn-secondary" disabled={busy}>{t.forms.pnr}</button>
    </ActForm>
  );

  // UX 5-4: acts possible now that are not a step of the sequence (the point of no return before it is set, the first appointment
  // while owed) sit together under the file, so the list reads as the acts in order and an open act never looks like an edit.
  const pnrOpen = reserved && !cleared && !view.pointOfNoReturnAt;
  const sideActs = pnrOpen || !!appointment;

  return (<>
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
      {reserved && view.pointOfNoReturnAt && <li className={ruled(false)}>
        <DoneAct tone={view.pointOfNoReturnApproved ? "done" : "waiting"} fact={<>{t.forms.pnrAt} {isolate(when(view.pointOfNoReturnAt))} · {view.pointOfNoReturnApproved ? t.pnrApproved : t.pnrPending}</>}
          change={!cleared && !view.pointOfNoReturnApproved ? t.forms.changePnr : undefined}>{pnrForm}</DoneAct></li>}
      {travelNode && <li className="border-t border-line">{travelNode}</li>}
      {!view.voucher && !cleared && <li className={ruled(voucherNow)}>{voucherNow
        ? <Task title={t.forms.voucher} next={false}>
            <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.forms.voucherHint}</p>
            <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={() => void act(`/operations/cases/${caseId}/admission/voucher`)}>{t.forms.voucher}</button>
          </Task>
        : <LaterAct notYet={t.acts.notYet}>{t.forms.voucher}</LaterAct>}</li>}
      {/* UX 5-4: an issued voucher stays a step of the sequence, its money behind its own line. */}
      {view.voucher && <li className={ruled(false)}><DoneAct fact={<>{t.voucher} <bdi dir="ltr" translate="no">{view.voucher.voucherNumber}</bdi> · {fillTemplate(t.voucherRevision, { revision: String(view.voucher.revision) })}</>}
        change={t.summary.money}>{money}</DoneAct></li>}
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
    {sideActs && (
      <details className="group border-b border-line">
        {/* Says what it holds, so a closed group is never a mystery. */}
        <Summary>{t.acts.alsoNow}: {[pnrOpen && t.pointOfNoReturn, appointment && t.firstAppointment.title].filter(Boolean).join(" · ")}</Summary>
        <div className="ps-6">
          {pnrOpen && <Task title={t.forms.pnr} next={false}>{pnrForm}</Task>}
          {appointment}
        </div>
      </details>
    )}
  </>);
}

/** A name or date set inside a sentence of the other script, isolated so it never reorders its neighbours. */
const isolate = (value: string) => `⁨${value}⁩`;

/** The admission number starts treatment: the confirmation repeats the number typed and says what it moves. */
const numberConfirm = (t: Copy) => ({
  title: (data: FormData) => fillTemplate(t.forms.numberConfirm, { number: isolate(String(data.get("admissionNumber") ?? "").trim()) }),
  body: t.forms.numberConfirmBody, confirm: t.forms.number, cancel: t.cancel,
});

/**
 * UX 4-1: Finance's side of the admission, in the order Finance works it. The money act of this moment comes first — the
 * letter's decision, a receipt to countersign, the fee balance — carrying the view's one filled button when it is the next
 * thing to do; each states what it is checked against and the gap, and asks before it commits. What is already checked follows
 * as one line per act (the voucher's money behind its own line), then what still stands before admission and is someone
 * else's, then the trail behind one disclosure. Presentation only: the backend decides every rule.
 */
function FinanceFile({ t, locale, view, caseId, next, busy, act, when, egp, money, pendingLetter, toCountersign, cleared }: {
  t: Copy; locale: Locale; view: AdmissionView; caseId: string; next: string | null; busy: boolean;
  act: (path: string, body?: unknown) => Promise<boolean>; when: (iso?: string | null) => string; egp: (n?: number | null) => string;
  /** The voucher's money, behind the voucher's own line. */ money: ReactNode;
  pendingLetter: AdmissionEvidence | null; toCountersign: AdmissionEvidence[]; cleared: boolean;
}) {
  const id = useId();
  const reserved = !!view.admissionId;
  const voucher = view.voucher ?? null;
  const openRows = view.evidence.filter(row => !row.superseded);
  const feeOwed = view.feeBalanceOwedEgp ?? 0;
  const letter = LETTER_DONE.has(view.letterCheck ?? "") ? openRows.find(row => row.kind === "FACILITY_ADMISSION_LETTER") ?? null : null;
  const signed = openRows.filter(row => COUNTERSIGNED_HERE.has(row.kind) && row.countersignedAt);
  const fees = openRows.filter(row => row.kind === "FEE_BALANCE_RECEIVED");
  // Before admission, what is not this page's act now: a receipt waiting here and a fee balance owed here are the acts above.
  const waiting = cleared ? [] : view.admissionBlockers.filter(code =>
    !(code === "BALANCE_NOT_EVIDENCED" && toCountersign.some(row => row.kind === "BALANCE_EVIDENCED")) && !(code === "FEE_BALANCE_DUE" && feeOwed > 0));
  const hospital = !view.facilityName ? null : view.facilityCity ? fillTemplate(t.forms.hospitalOption, { name: isolate(view.facilityName), city: isolate(view.facilityCity) }) : isolate(view.facilityName);
  const done = !!voucher || !!letter || signed.length > 0 || fees.length > 0 || !!view.admissionNumber;

  return (<>
    <p className="mt-1 text-[0.875rem] text-ink-700">{!reserved ? t.notReserved
      : <><span className="font-semibold text-ink-900">{hospital ?? "—"}</span>{view.plannedAdmissionAt && <> · {t.plannedAt} {isolate(when(view.plannedAdmissionAt))}</>}</>}</p>

    {pendingLetter && <LetterDecision key={pendingLetter.id} t={t} locale={locale} letter={pendingLetter} variance={view.letterCheck === "VARIANCE_OPEN"} referenceMax={view.letterReferenceMaxEgp}
      egp={egp} busy={busy} primary={next === "decide"} onDecide={(decision, note) => act(`/finance/cases/${caseId}/admission/letter/decision`, { evidenceId: pendingLetter.id, decision, note })}/>}
    {toCountersign.length > 0 && (
      <div className="mt-3 border-t border-line pt-3">
        <h4 id={`${id}-countersign`} className="text-[0.875rem] font-bold text-ink-800">{t.finance.toCountersign}</h4>
        <ul aria-labelledby={`${id}-countersign`} className="divide-y divide-line">
          {/* The difference is said against what is owed only for a single receipt: two part-receipts are each "short". */}
          {toCountersign.map(row => <Countersign key={row.id} t={t} row={row} owed={view.balanceOwedEgp}
                                                 compare={toCountersign.filter(other => other.kind === "BALANCE_EVIDENCED").length === 1} when={when} egp={egp} busy={busy} primary={next === `countersign:${row.id}`}
                                                 onConfirm={() => act(`/finance/cases/${caseId}/evidence/${row.id}/countersign`)}/>)}
        </ul>
      </div>
    )}
    {feeOwed > 0 && (
      <div className="mt-3">
        <Task title={t.finance.feeTitle} next={next === "fee"}>
          <FeeBalance t={t} voucher={voucher} owed={feeOwed} egp={egp} busy={busy} primary={next === "fee"}
            onRecord={body => act(`/finance/cases/${caseId}/admission/fee-balance`, body)}/>
        </Task>
      </div>
    )}

    {done && (<div className="mt-3 border-t border-line pt-3">
      <h4 id={`${id}-done`} className="text-[0.875rem] font-bold text-ink-800">{t.finance.done}</h4>
      <ol aria-labelledby={`${id}-done`} className="divide-y divide-line border-b border-line">
        {letter && <li><DoneAct tone={view.letterCheck === "REFUSED" ? "warning" : "done"}
          fact={<>{t.letter} · <Money>{egp(letter.amountEgp)}</Money> · <span className={letterTone(view.letterCheck) === "warning" ? "text-alert-800" : undefined}>{pick(t.letterCheck, view.letterCheck ?? "NONE")}</span></>}/></li>}
        {/* A voucher not issued yet is said once, among what stands before admission. */}
        {voucher && <li><DoneAct fact={<>{t.voucher} <bdi dir="ltr" translate="no">{voucher.voucherNumber}</bdi> · {fillTemplate(t.voucherRevision, { revision: String(voucher.revision) })}</>} change={t.summary.money}>{money}</DoneAct></li>}
        {signed.map(row => <li key={row.id}><DoneAct fact={row.kind === "POINT_OF_NO_RETURN"
          ? <>{t.forms.pnrAt} {isolate(when(row.effectiveAt ?? view.pointOfNoReturnAt))} · {t.pnrApproved}</>
          : <>{pick(t.trail.kinds, row.kind)}{row.reference && <> <bdi dir="ltr" translate="no">{row.reference}</bdi></>} · <Money>{egp(row.amountEgp)}</Money> · {t.acts.checked}</>}/></li>)}
        {fees.map(row => <li key={row.id}><DoneAct fact={<>{pick(t.trail.kinds, row.kind)} · <Money>{egp(row.amountEgp)}</Money>{row.reference && <> · <bdi dir="ltr" translate="no">{row.reference}</bdi></>}</>}/></li>)}
        {view.admissionNumber && <li><DoneAct fact={<>{t.admissionNumber} <bdi dir="ltr" translate="no">{view.admissionNumber}</bdi></>}/></li>}
      </ol>
    </div>)}

    {waiting.length > 0 && (
      <div className="mt-3">
        <h4 id={`${id}-waiting`} className="flex items-start gap-2 text-[0.875rem] font-bold text-ink-800"><Clock size={16} aria-hidden className="mt-0.5 flex-none text-ink-500"/>{t.acts.waitingOn}</h4>
        <ul aria-labelledby={`${id}-waiting`} className="mt-1 list-disc space-y-1 ps-6 text-[0.875rem] text-ink-700">{waiting.map(code => <li key={code}>{pick(t.checklist.blockers, code)}</li>)}</ul>
      </div>
    )}
    {view.emergencyOverride && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.emergencyRecorded}</p>}

    {view.evidence.length > 0 && (
      <details className="group mt-1">
        <Summary>{t.trail.title} ({view.evidence.length})</Summary>
        <Trail t={t} evidence={view.evidence} when={when} egp={egp}/>
      </details>
    )}
  </>);
}

/**
 * UX 4-1: the platform fee balance, derived where it is recorded (the fee less what the deposit covered of it, as the voucher
 * froze it), and recorded after a question that repeats the amount and the reference.
 */
function FeeBalance({ t, voucher, owed, egp, busy, primary, onRecord }: {
  t: Copy; voucher: AdmissionView["voucher"] | null; owed: number; egp: (n?: number | null) => string; busy: boolean; primary: boolean;
  onRecord: (body: { reference: string; amountEgp: number; receivedAt: string | null }) => Promise<boolean>;
}) {
  const id = useId();
  const received = voucher ? Math.max(0, voucher.feeBalanceEgp - owed) : 0;
  return (
    <ActForm className="grid gap-3 sm:grid-cols-3" refused={t.forms.refused} retry={t.forms.refusedRetry}
      confirm={{ title: data => fillTemplate(t.finance.feeConfirmTitle, { amount: isolate(egp(readAmount(data.get("amountEgp")))), reference: isolate(String(data.get("reference") ?? "").trim()) }),
        body: t.finance.feeConfirmBody, confirm: t.finance.recordFee, cancel: t.cancel }}
      action={data => onRecord({ reference: String(data.get("reference") ?? "").trim(), amountEgp: readAmount(data.get("amountEgp")), receivedAt: instant(data.get("receivedAt")) })}>
      {voucher && (
        <div id={`${id}-derivation`} className="text-[0.875rem] tabular-nums text-ink-700 sm:col-span-3">
          <p>{fillTemplate(t.finance.feeDerivation, { fee: isolate(egp(voucher.platformFeeEgp)), applied: isolate(egp(voucher.depositPaidEgp - voucher.depositCreditEgp)), balance: isolate(egp(voucher.feeBalanceEgp)) })}</p>
          {received > 0 && <p className="mt-1">{fillTemplate(t.finance.feeReceived, { received: isolate(egp(received)), owed: isolate(egp(owed)) })}</p>}
        </div>
      )}
      <label className="block text-sm font-semibold">{t.finance.reference}<input className="field" name="reference" maxLength={160} required autoComplete="off" spellCheck={false} dir="auto"/></label>
      <div>
        <label htmlFor={`${id}-amount`} className="block text-sm font-semibold">{t.forms.amountEgp}</label>
        <AmountInput id={`${id}-amount`} name="amountEgp" invalid={t.forms.amountInvalid} defaultValue={owed} describedBy={voucher ? `${id}-derivation` : undefined}/>
      </div>
      <TimeField label={t.finance.receivedAt} name="receivedAt" hint={t.forms.timeHint}/>
      <div className="sm:col-span-3"><button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.finance.recordFee}</button></div>
    </ActForm>
  );
}

/** The frozen voucher: its number, what each side pays, what is still owed, and the rate it was frozen at. */
function VoucherFacts({ t, locale, voucher, view, egp }: { t: Copy; locale: Locale; voucher: NonNullable<AdmissionView["voucher"]>; view: AdmissionView; egp: (n?: number | null) => string }) {
  // UX 4-1: EGP is the ledger's figure and leads; the patient's currency is its sub-line; the rate as Finance quotes it.
  const foreign = voucher.displayCurrency && voucher.displayCurrency !== "EGP" ? voucher.displayCurrency : null;
  const sub = (amount?: number | null) => foreign && amount != null
    ? <span className="block text-[0.8125rem] font-normal text-ink-600"><Money>{formatMoney(amount, foreign, locale)}</Money></span> : null;
  const rate = foreign ? quotedRate(locale, foreign, voucher.fxRate) : null;
  return (
    <>
      <p className="text-[0.875rem] text-ink-500">{t.voucher} <bdi dir="ltr" translate="no" className="font-bold text-ink-900">{voucher.voucherNumber}</bdi> · {fillTemplate(t.voucherRevision, { revision: String(voucher.revision) })}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-2 text-[0.875rem] tabular-nums sm:grid-cols-2 lg:grid-cols-3">
        <Fact label={t.money.packageTotal}><Money>{egp(voucher.packageTotalEgp)}</Money></Fact>
        <Fact label={t.money.platformFee}><Money>{egp(voucher.platformFeeEgp)}</Money></Fact>
        <Fact label={t.money.depositPaid}><Money>{egp(voucher.depositPaidEgp)}</Money></Fact>
        <Fact label={t.money.depositCredit}><Money>{egp(voucher.depositCreditEgp)}</Money></Fact>
        <Fact label={t.money.patientPays}><Money>{egp(voucher.patientPaysAtFacilityEgp)}</Money>{sub(voucher.patientPaysAtFacilityDisplay)}</Fact>
        {voucher.feeBalanceEgp > 0 && <Fact label={t.money.feeBalance}><Money>{egp(voucher.feeBalanceEgp)}</Money>{sub(voucher.feeBalanceDisplay)}</Fact>}
        <Fact label={t.money.balanceOwed}><Money>{egp(view.balanceOwedEgp)}</Money></Fact>
        {(view.feeBalanceOwedEgp ?? 0) > 0 && <Fact label={t.money.feeBalanceOwed}><Money>{egp(view.feeBalanceOwedEgp)}</Money></Fact>}
      </dl>
      {rate && voucher.fxRateDate && (
        <p className="mt-2 text-[0.8125rem] text-ink-600">{fillTemplate(t.money.rate, { rate,
          date: new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${voucher.fxRateDate}T00:00:00Z`)) })}</p>
      )}
    </>
  );
}

/** The first appointment sets the refund cutoff: recorded before admission, corrected with a reason. */
function FirstAppointment({ t, caseId, set, busy, act }: { t: Copy; caseId: string; set: boolean; busy: boolean; act: (path: string, body?: unknown) => Promise<boolean> }) {
  return (
    <Task title={set ? t.firstAppointment.correct : t.firstAppointment.title} next={false}>
      <p className="mb-3 max-w-[65ch] text-[0.875rem] text-ink-600">{t.firstAppointment.hint}</p>
      <ActForm className="grid gap-3 sm:grid-cols-2" refused={t.forms.refused} retry={t.forms.refusedRetry} action={data => act(`/cases/${caseId}/first-confirmed-appointment`, { appointmentDate: text(data.get("appointmentDate")), reason: text(data.get("reason")) })}>
        <label className="block text-sm font-semibold">{t.firstAppointment.date}<input className="field" name="appointmentDate" type="date" required dir="ltr"/></label>
        <label className="block text-sm font-semibold">{t.firstAppointment.reason}<input className="field" name="reason" maxLength={500} required dir="auto"/></label>
        <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{set ? t.firstAppointment.correct : t.firstAppointment.record}</button></div>
      </ActForm>
    </Task>
  );
}

/** The evidence trail: every recorded fact, who recorded and who countersigned it, the superseded ones greyed. */
function Trail({ t, evidence, when, egp }: { t: Copy; evidence: AdmissionEvidence[]; when: (iso?: string | null) => string; egp: (n?: number | null) => string }) {
  if (evidence.length === 0) return <p className="pb-2 text-[0.875rem] text-ink-500">{t.trail.empty}</p>;
  return (
    <ol aria-label={t.trail.title} className="divide-y divide-line text-[0.875rem]">
      {evidence.map(row => (
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
  );
}

/** A recording task of this panel: its next one carries the panel's "do it" anchor. */
function Task({ title, next, children }: { title: string; next: boolean; children: ReactNode }) {
  return <PanelTask title={title} next={next} anchor="admission-next">{children}</PanelTask>;
}

/**
 * UX 4-1: the hospital's letter as Finance checks it — the price, the estimate's maximum, and the gap already worked out with
 * its percentage. Accepting asks first, the amount in the question; a reason is owed for a price above the estimate. Refusing
 * is the second verb, behind its own disclosure, with its reason and its own question.
 */
function LetterDecision({ t, locale, letter, variance, referenceMax, egp, busy, primary, onDecide }: {
  t: Copy; locale: Locale; letter: AdmissionEvidence; variance: boolean; referenceMax?: number | null; egp: (n?: number | null) => string; busy: boolean; primary: boolean;
  onDecide: (decision: "ACCEPT" | "REFUSE", note: string | null) => Promise<boolean>;
}) {
  const quoted = letter.amountEgp;
  const gap = quoted != null && referenceMax != null ? Math.round((quoted - referenceMax) * 100) / 100 : null;
  const percent = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1 });
  // A percentage of a zero maximum means nothing: the gap is then said as an amount only.
  const gapText = gap == null || referenceMax == null ? null
    : gap > 0 ? fillTemplate(t.finance.gapAbove, { amount: isolate(egp(gap)), percent: isolate(referenceMax > 0 ? percent.format(gap / referenceMax) : "—") })
    : gap < 0 ? fillTemplate(t.finance.gapBelow, { amount: isolate(egp(-gap)) }) : t.finance.gapAt;
  const amount = isolate(egp(quoted));
  return (
    <div id={primary ? "admission-next" : undefined} className="mt-3 border-t border-line pt-3">
      <h4 className="text-[0.875rem] font-bold text-ink-800">{t.finance.letterTitle}</h4>
      <dl className="mt-1.5 grid gap-x-6 gap-y-2 text-[0.875rem] tabular-nums sm:grid-cols-3">
        <Fact label={t.finance.quoted}><Money>{egp(quoted)}</Money>{letter.reference && <span className="block text-[0.8125rem] font-normal text-ink-600"><bdi dir="ltr" translate="no">{letter.reference}</bdi></span>}</Fact>
        {referenceMax != null && <Fact label={t.referenceMax}><Money>{egp(referenceMax)}</Money></Fact>}
        {gapText && <Fact label={t.finance.gap}><span className={gap != null && gap > 0 ? "text-alert-800" : undefined}>{gapText}</span></Fact>}
      </dl>
      <ActForm className="mt-3 flex flex-col items-start gap-3" refused={t.forms.refused} retry={t.forms.refusedRetry}
        confirm={{ title: () => fillTemplate(t.finance.acceptTitle, { amount }), body: variance && gapText ? fillTemplate(t.finance.acceptBodyVariance, { gap: gapText }) : t.finance.acceptBody,
          confirm: t.finance.accept, cancel: t.cancel }}
        action={data => onDecide("ACCEPT", text(data.get("note")))}>
        <ReasonField label={variance ? t.finance.note : t.finance.noteOptional} owed={variance ? t.finance.noteRequired : undefined} hint={variance ? t.finance.noteRequired : undefined}/>
        <button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.finance.accept}</button>
      </ActForm>
      <details className="group mt-3 border-t border-line">
        <Summary>{t.finance.refuseOpen}</Summary>
        <ActForm className="flex flex-col items-start gap-3 pb-3" refused={t.forms.refused} retry={t.forms.refusedRetry}
          confirm={{ title: () => fillTemplate(t.finance.refuseTitle, { amount }), body: t.finance.refuseBody, confirm: t.finance.refuse, cancel: t.cancel }}
          action={data => onDecide("REFUSE", text(data.get("note")))}>
          <ReasonField label={t.finance.refuseNote} owed={t.finance.refuseNoteRequired}/>
          <button className="btn-secondary" disabled={busy}>{t.finance.refuse}</button>
        </ActForm>
      </details>
    </div>
  );
}

/**
 * A record Finance countersigns. UX 4-1: a cashier receipt reads as a checked fact — its amount against what the voucher says
 * is owed at the cashier, and the difference said in words — and the question repeats the amount; a refusal is said in place.
 */
function Countersign({ t, row, owed, compare, when, egp, busy, primary, onConfirm }: {
  t: Copy; row: AdmissionEvidence; owed?: number | null; /** Whether the difference against `owed` is said (one receipt waiting). */ compare: boolean;
  when: (iso?: string | null) => string; egp: (n?: number | null) => string; busy: boolean; primary: boolean; onConfirm: () => Promise<boolean>;
}) {
  const kind = pick(t.trail.kinds, row.kind);
  const receipt = row.kind === "BALANCE_EVIDENCED";
  const diff = receipt && compare && row.amountEgp != null && owed != null ? Math.round((row.amountEgp - owed) * 100) / 100 : null;
  const verdict = diff == null ? null : diff === 0 ? t.finance.receiptMatches
    : fillTemplate(diff < 0 ? t.finance.receiptShort : t.finance.receiptOver, { amount: isolate(egp(Math.abs(diff))) });
  return (
    <li id={primary ? "admission-next" : undefined} className="py-3 text-[0.875rem]">
      <p className="font-semibold text-ink-900 [overflow-wrap:anywhere]">{kind}{row.reference && <> <bdi dir="ltr" translate="no">{row.reference}</bdi></>}
        {!receipt && row.amountEgp != null && <> · <Money>{egp(row.amountEgp)}</Money></>}{row.kind === "POINT_OF_NO_RETURN" && <> · {isolate(when(row.effectiveAt ?? row.recordedAt))}</>}</p>
      <p className="text-[0.8125rem] text-ink-600">{fillTemplate(t.trail.recorded, { role: pick(t.trail.roles, row.recordedRole ?? "SYSTEM") })} · {when(row.effectiveAt ?? row.recordedAt)}</p>
      {receipt && (
        <dl className="mt-2 grid gap-x-6 gap-y-2 tabular-nums sm:grid-cols-3">
          <Fact label={kind}><Money>{egp(row.amountEgp)}</Money></Fact>
          <Fact label={t.finance.owedAtCashier}><Money>{egp(owed)}</Money></Fact>
          {verdict && <Fact label={t.finance.check}><span className={diff === 0 ? undefined : "text-alert-800"}>{verdict}</span></Fact>}
        </dl>
      )}
      <ActForm className="mt-3" refused={t.forms.refused} retry={t.forms.refusedRetry} action={() => onConfirm()}
        confirm={{ title: () => receipt && row.amountEgp != null ? fillTemplate(t.finance.countersignReceiptTitle, { amount: isolate(egp(row.amountEgp)) }) : t.finance.countersignTitle,
          body: t.finance.countersignBody, confirm: t.finance.countersign, cancel: t.cancel }}>
        <button className={primary ? "btn-primary" : "btn-secondary"} disabled={busy}>{t.finance.countersign}<span className="sr-only">: {row.reference ? `${kind} ${row.reference}` : kind}</span></button>
      </ActForm>
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

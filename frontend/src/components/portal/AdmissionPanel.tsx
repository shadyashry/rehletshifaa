"use client";

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy, type LocalizedWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { DocumentPicker, Fact, Money, Summary, Task as PanelTask, instant, pick, submit, text, type PanelDocument } from "@/components/portal/panel-parts";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import type { AdmissionEvidence, AdmissionView, DirectoryFacility, Mutate } from "@/components/portal/portal-model";

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
 * decides every rule; the panel offers one primary action — the next one — and keeps the rest one click away.
 */
export function AdmissionPanel({ locale, role, caseId, caseStatus, currentCode, documents = [], facilities = [], busy, mutate, load }: {
  locale: Locale; role: AdmissionRole; caseId: string; caseStatus: string;
  /** The viewer's current action code or work type, which picks the form that opens first. */
  currentCode?: string | null;
  documents?: Doc[]; facilities?: DirectoryFacility[]; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const t = useWorkCopy().admission;
  const id = useId();
  const [view, setView] = useState<AdmissionView | null | undefined>(undefined);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const when = (iso?: string | null) => iso ? dateTime.format(new Date(iso)) : "—";
  const egp = (amount?: number | null) => amount == null ? "—" : formatMoney(amount, "EGP", locale);

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
    return true;
  }, [mutate, read]);

  if (view === undefined) return null;
  if (view === null) return <section id="admission-panel" className="card p-5"><h3 className="title text-base">{t.title}</h3><p role="alert" className="mt-2 text-[0.875rem] text-alert-800">{t.loadFailed}</p></section>;

  const reserved = !!view.admissionId;
  const voucher = view.voucher ?? null;
  const openRows = view.evidence.filter(row => !row.superseded);
  const pendingLetter = role === "finance" && LETTER_DECIDABLE.has(view.letterCheck ?? "")
    ? openRows.find(row => row.kind === "FACILITY_ADMISSION_LETTER" && !row.countersignedAt) ?? null : null;
  const toCountersign = role === "finance" ? openRows.filter(row => COUNTERSIGNED_HERE.has(row.kind) && !row.countersignedAt) : [];
  const feeOwed = (view.feeBalanceOwedEgp ?? 0) > 0;
  // The next thing this viewer does here: its form opens and carries the panel's one primary button.
  const next = role === "operations"
    ? (!reserved ? "reserve" : ["NONE", "REFUSED"].includes(view.letterCheck ?? "NONE") ? "letter" : currentCode === "RECORD_HOSPITAL_BALANCE" ? "receipt"
      : currentCode === "RECORD_ADMISSION_NUMBER" ? "number" : null)
    // In treatment, Finance's current work may be the Treatment panel's (P1-16): this panel then leads only for its own work.
    : role === "finance" && (caseStatus !== "TREATMENT_IN_PROGRESS" || ADMISSION_WORK.has(currentCode ?? "")) ? (pendingLetter ? "decide" : toCountersign.length > 0 ? `countersign:${toCountersign[0].id}` : feeOwed ? "fee" : null)
    : null;
  const btn = (key: string) => next === key ? "btn-primary" : "btn-secondary";
  const cleared = ["ADMISSION_READY", "TREATMENT_IN_PROGRESS"].includes(view.caseStatus ?? caseStatus);
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
        <form className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"
          onSubmit={submit(data => act(`/doctor/cases/${caseId}/admission/number`, { admissionNumber: String(data.get("admissionNumber") ?? "").trim() }))}>
          <p id={`${id}-number-hint`} className="w-full max-w-[65ch] text-[0.875rem] text-ink-600">{t.summary.emergencyNumber}</p>
          <label className="block text-sm font-semibold">{t.forms.numberField}<input className="field" name="admissionNumber" maxLength={80} required autoComplete="off" spellCheck={false} dir="ltr" aria-describedby={`${id}-number-hint`}/></label>
          <button className="btn-primary" disabled={busy}>{t.forms.number}</button>
        </form>
      )}
    </section>
  );

  return (
    <section id="admission-panel" aria-labelledby={`${id}-title`} className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 id={`${id}-title`} className="title text-base">{t.title}</h3>
        {view.admissionStatus && <StatusBadge tone={view.admissionStatus === "CANCELLED" ? "neutral" : view.admissionStatus === "RESERVED" ? "info" : "success"}>{pick(t.admissionStatus, view.admissionStatus)}</StatusBadge>}
      </div>

      {!reserved ? <p className="mt-2 text-[0.875rem] text-ink-600">{t.notReserved}</p> : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2 lg:grid-cols-3">
          <Fact label={t.facility}><bdi>{view.facilityName ?? "—"}</bdi>{view.facilityCity && <span className="font-normal text-ink-600"> · <bdi>{view.facilityCity}</bdi></span>}</Fact>
          <Fact label={t.plannedAt}>{when(view.plannedAdmissionAt)}</Fact>
          <Fact label={t.letter}><span className={letterTone(view.letterCheck) === "warning" ? "text-alert-800" : undefined}>{pick(t.letterCheck, view.letterCheck ?? "NONE")}</span></Fact>
          {view.letterReferenceMaxEgp != null && <Fact label={t.referenceMax}><Money>{egp(view.letterReferenceMaxEgp)}</Money></Fact>}
          {view.pointOfNoReturnAt && <Fact label={t.pointOfNoReturn}>{when(view.pointOfNoReturnAt)} <span className="font-normal text-ink-600">· {view.pointOfNoReturnApproved ? t.pnrApproved : t.pnrPending}</span></Fact>}
          {view.admissionNumber && <Fact label={t.admissionNumber}><bdi dir="ltr">{view.admissionNumber}</bdi></Fact>}
        </dl>
      )}

      {voucherFacts ? <div className="mt-4 border-t border-line pt-3">{voucherFacts}</div>
        : reserved && <p className="mt-4 border-t border-line pt-3 text-[0.875rem] text-ink-600">{t.noVoucher}</p>}

      <div className="mt-4 border-t border-line pt-3">
        <h4 className="text-[0.875rem] font-bold text-ink-800">{t.checklist.title}</h4>
        {view.admissionBlockers.length === 0
          ? <p className="mt-1 text-[0.875rem] text-ink-700">{t.checklist.clear}</p>
          : <ul className="mt-1.5 list-disc space-y-1 ps-5 text-[0.875rem] text-ink-700">{view.admissionBlockers.map(code => <li key={code}>{pick(t.checklist.blockers, code)}</li>)}</ul>}
        {view.emergencyOverride && <p className="mt-2 text-[0.875rem] font-semibold text-alert-800">{t.emergencyRecorded}</p>}
      </div>

      {role === "operations" && (
        <div className="mt-2">
          {ADMISSION_STAGES.has(caseStatus) && !cleared && (
            <Task title={reserved ? t.forms.changeReservation : t.forms.reserve} next={next === "reserve"}>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/operations/cases/${caseId}/admission`, { facilityId: data.get("facilityId"), plannedAdmissionAt: instant(data.get("plannedAdmissionAt")) }))}>
                <label className="block text-sm font-semibold">{t.facility}
                  <select className="field" name="facilityId" required defaultValue={view.facilityId ?? ""}><option value="">{t.forms.chooseFacility}</option>{facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}</select>
                </label>
                <label className="block text-sm font-semibold">{t.plannedAt}<input className="field" name="plannedAdmissionAt" type="datetime-local" required/></label>
                <div className="sm:col-span-2"><button className={btn("reserve")} disabled={busy}>{t.forms.save}</button></div>
              </form>
            </Task>
          )}
          {reserved && !cleared && (
            <Task title={t.forms.letter} next={next === "letter"}>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/operations/cases/${caseId}/admission/letter`, { documentId: data.get("documentId"), quotedPackageEgp: Number(data.get("quotedPackageEgp")), reference: text(data.get("reference")) }))}>
                <DocumentPicker name="documentId" label={t.forms.document} empty={t.forms.chooseDocument} documents={documents} required/>
                <label className="block text-sm font-semibold">{t.forms.quoted}<input className="field" name="quotedPackageEgp" type="number" inputMode="decimal" min="0" step="0.01" required/></label>
                <label className="block text-sm font-semibold">{t.forms.reference}<input className="field" name="reference" maxLength={160} autoComplete="off" spellCheck={false}/></label>
                {!documents.some(d => d.status === "CLEAN") && <p className="text-[0.8125rem] text-ink-600 sm:col-span-2">{t.forms.noDocuments}</p>}
                <div className="sm:col-span-2"><button className={btn("letter")} disabled={busy}>{t.forms.record}</button></div>
              </form>
            </Task>
          )}
          {reserved && !voucher && (
            <Task title={t.forms.voucher} next={false}>
              <p className="max-w-[65ch] text-[0.8125rem] leading-5 text-ink-600">{t.forms.voucherHint}</p>
              <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={() => void act(`/operations/cases/${caseId}/admission/voucher`)}>{t.forms.voucher}</button>
            </Task>
          )}
          {voucher && (view.balanceOwedEgp ?? 0) > 0 && (
            <Task title={t.forms.receipt} next={next === "receipt"}>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/operations/cases/${caseId}/admission/balance`, {
                receiptNumber: data.get("receiptNumber"), amountEgp: Number(data.get("amountEgp")), paidAt: instant(data.get("paidAt")), method: data.get("method"),
                documentId: data.get("documentId") || null, paidCurrency: text(data.get("paidCurrency"))?.toUpperCase() ?? null, paidAmount: data.get("paidAmount") ? Number(data.get("paidAmount")) : null }))}>
                <label className="block text-sm font-semibold">{t.forms.receiptNumber}<input className="field" name="receiptNumber" maxLength={160} required autoComplete="off" spellCheck={false}/></label>
                <label className="block text-sm font-semibold">{t.forms.amountEgp}<input className="field" name="amountEgp" type="number" inputMode="decimal" min="0.01" step="0.01" required/></label>
                <label className="block text-sm font-semibold">{t.forms.paidAt}<input className="field" name="paidAt" type="datetime-local" required/></label>
                <label className="block text-sm font-semibold">{t.forms.method}
                  <select className="field" name="method" defaultValue="CASH">{(["CASH", "CARD", "BANK_TRANSFER"] as const).map(m => <option key={m} value={m}>{t.forms.methods[m]}</option>)}</select>
                </label>
                <DocumentPicker name="documentId" label={t.forms.receiptDocument} empty={t.forms.none} documents={documents}/>
                <label className="block text-sm font-semibold">{t.forms.paidCurrency}<input className="field" name="paidCurrency" maxLength={3} pattern="[A-Za-z]{3}" autoComplete="off" spellCheck={false} dir="ltr"/></label>
                <label className="block text-sm font-semibold">{t.forms.paidAmount}<input className="field" name="paidAmount" type="number" inputMode="decimal" min="0" step="0.01"/></label>
                <div className="sm:col-span-2"><button className={btn("receipt")} disabled={busy}>{t.forms.record}</button></div>
              </form>
            </Task>
          )}
          {reserved && !cleared && !view.pointOfNoReturnApproved && (
            <Task title={t.forms.pnr} next={false}>
              <form className="flex flex-wrap items-end gap-3" onSubmit={submit(data => act(`/operations/cases/${caseId}/admission/point-of-no-return`, { at: instant(data.get("at")) }))}>
                <label className="block text-sm font-semibold">{t.forms.pnrAt}<input className="field" name="at" type="datetime-local" required/></label>
                <button className="btn-secondary" disabled={busy}>{t.forms.save}</button>
              </form>
            </Task>
          )}
          {cleared && (
            <Task title={t.forms.number} next={next === "number"}>
              <form className="flex flex-wrap items-end gap-3" onSubmit={submit(data => act(`/operations/cases/${caseId}/admission/number`, { admissionNumber: String(data.get("admissionNumber") ?? "").trim() }))}>
                <label className="block text-sm font-semibold">{t.forms.numberField}<input className="field" name="admissionNumber" maxLength={80} required autoComplete="off" spellCheck={false} dir="ltr" defaultValue={view.admissionNumber ?? ""} aria-describedby={view.caseStatus === "ADMISSION_READY" ? `${id}-number-hint` : undefined}/></label>
                <button className={btn("number")} disabled={busy}>{t.forms.save}</button>
                {view.caseStatus === "ADMISSION_READY" && <p id={`${id}-number-hint`} className="w-full text-[0.8125rem] text-ink-500">{t.forms.numberHint}</p>}
              </form>
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
              <form className="grid gap-3 sm:grid-cols-3" onSubmit={submit(data => act(`/finance/cases/${caseId}/admission/fee-balance`, { reference: String(data.get("reference") ?? "").trim(), amountEgp: Number(data.get("amountEgp")), receivedAt: instant(data.get("receivedAt")) }))}>
                <label className="block text-sm font-semibold">{t.finance.reference}<input className="field" name="reference" maxLength={160} required autoComplete="off" spellCheck={false}/></label>
                <label className="block text-sm font-semibold">{t.forms.amountEgp}<input className="field" name="amountEgp" type="number" inputMode="decimal" min="0.01" step="0.01" required defaultValue={view.feeBalanceOwedEgp ?? undefined}/></label>
                <label className="block text-sm font-semibold">{t.finance.receivedAt}<input className="field" name="receivedAt" type="datetime-local" required/></label>
                <p className="text-[0.8125rem] text-ink-500 sm:col-span-3">{t.finance.freshSignIn}</p>
                <div className="sm:col-span-3"><button className={btn("fee")} disabled={busy}>{t.forms.record}</button></div>
              </form>
            </Task>
          )}
        </div>
      )}

      {(role === "operations" || role === "coordinator") && (
        <Task title={t.firstAppointment.title} next={false}>
          <p className="mb-3 text-[0.875rem] text-ink-600">{t.firstAppointment.hint}</p>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit(data => act(`/cases/${caseId}/first-confirmed-appointment`, { appointmentDate: text(data.get("appointmentDate")), reason: text(data.get("reason")) }))}>
            <label className="block text-sm font-semibold">{t.firstAppointment.date}<input className="field" name="appointmentDate" type="date" required /></label>
            <label className="block text-sm font-semibold">{t.firstAppointment.reason}<input className="field" name="reason" maxLength={500} required /></label>
            <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{t.forms.record}</button></div>
          </form>
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

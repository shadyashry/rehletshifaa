"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import { StatusBadge, type StatusTone } from "@/components/portal/StatusBadge";
import type { Mutate, PatientAdmissionView } from "@/components/portal/portal-model";

/**
 * P1-15 (D-B, D-C), inside My Care's current step: where and when the patient is admitted, the voucher number to show at the
 * hospital cashier, what to pay there (EGP and, at the rate frozen on the quote, their own currency) and any platform fee
 * balance — the amounts exactly as the API returns them, never recomputed here. On CONFIRM_ARRIVAL it carries the step's one
 * action, "I have arrived", after a confirmation.
 */
export function PatientAdmission({ locale, caseId, code, busy, mutate, load }: {
  locale: Locale; caseId: string; code: string; busy: boolean; mutate: Mutate; load: <T>(path: string) => Promise<T>;
}) {
  const work = useWorkCopy();
  const t = work.myCare.admission;
  // undefined while loading; null when there is no reservation yet (the API answers with an empty body) or the read failed.
  const [view, setView] = useState<PatientAdmissionView | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const dateTime = useMemo(() => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeStyle: "short" }), [locale]);

  useEffect(() => {
    let live = true;
    load<PatientAdmissionView | null>(`/patient/cases/${caseId}/admission`).then(value => { if (live) setView(value ?? null); }, () => { if (live) setView(null); });
    return () => { live = false; };
  }, [load, caseId, code]);

  const arrival = code === "CONFIRM_ARRIVAL";
  const money = !!view?.voucherNumber && (code === "PAY_BALANCE" || code === "WAIT_BALANCE_CHECK");
  const currency = view?.displayCurrency ?? null;
  const showDisplay = (egp?: number | null, display?: number | null) => display != null && currency && currency !== "EGP" && egp != null;
  const fee = view?.feeBalanceEgp ?? 0;
  const state = view?.balanceState && view.balanceState !== "NO_VOUCHER" ? (t.state as Record<string, string>)[view.balanceState] : null;

  return (
    <div className="mt-5 border-t border-line pt-4">
      {code === "CLEARED_FOR_ADMISSION" && view?.plannedAdmissionAt && (
        <p className="text-[1.0625rem] font-semibold leading-7 text-brand-900">{fillTemplate(t.clearedOn, { date: dateTime.format(new Date(view.plannedAdmissionAt)) })}</p>
      )}
      {view && (view.facilityName || view.plannedAdmissionAt || view.voucherNumber) && (
        <section aria-labelledby="admission-title" className={code === "CLEARED_FOR_ADMISSION" && view.plannedAdmissionAt ? "mt-4" : ""}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 id="admission-title" className="label-micro text-ink-500">{t.title}</h3>
            {money && state && <StatusBadge tone={balanceTone(view.balanceState)}>{state}</StatusBadge>}
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-[0.9375rem] sm:grid-cols-2">
            {view.facilityName && <Fact label={t.hospital}><bdi>{view.facilityName}</bdi>{view.facilityCity && <span className="font-normal text-ink-600"> · <bdi>{view.facilityCity}</bdi></span>}</Fact>}
            {view.plannedAdmissionAt && <Fact label={t.date}>{dateTime.format(new Date(view.plannedAdmissionAt))}</Fact>}
            {view.voucherNumber && <Fact label={t.voucher}><bdi dir="ltr" translate="no" className="tabular-nums tracking-wide">{view.voucherNumber}</bdi></Fact>}
          </dl>
          {money && view.payAtFacilityEgp != null && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[0.875rem] font-semibold text-ink-600">{t.payAtHospital}</p>
              <p className="statement mt-1 text-brand-900 tabular-nums"><bdi dir="ltr">{formatMoney(view.payAtFacilityEgp, "EGP", locale)}</bdi></p>
              {showDisplay(view.payAtFacilityEgp, view.payAtFacilityDisplay) && (
                <p className="mt-1 text-[0.875rem] text-ink-600">{fillTemplate(t.inYourCurrency, { amount: `⁨${formatMoney(view.payAtFacilityDisplay!, currency!, locale)}⁩` })}</p>
              )}
              {view.depositCreditEgp != null && view.depositCreditEgp > 0 && (
                <p className="mt-1 text-[0.875rem] text-ink-600">{t.depositCredit}: <bdi dir="ltr" className="tabular-nums">{formatMoney(view.depositCreditEgp, "EGP", locale)}</bdi></p>
              )}
            </div>
          )}
          {money && fee > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[0.875rem] font-semibold text-ink-600">{t.feeBalance}</p>
              <p className="mt-1 text-[1.0625rem] font-bold text-ink-900 tabular-nums"><bdi dir="ltr">{formatMoney(fee, "EGP", locale)}</bdi>
                {showDisplay(fee, view.feeBalanceDisplay) && <span className="font-normal text-ink-600"> · <bdi dir="ltr">{formatMoney(view.feeBalanceDisplay!, currency!, locale)}</bdi></span>}</p>
              <p className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.feeBalanceNote}</p>
            </div>
          )}
        </section>
      )}
      {arrival && (
        <button type="button" className="btn-primary mt-6" disabled={busy} onClick={() => setConfirming(true)}>{t.arrived}</button>
      )}
      {confirming && (
        <ConfirmDialog title={t.arrivedTitle} body={t.arrivedBody} confirm={t.arrivedConfirm} cancel={t.cancel}
                       onConfirm={() => { setConfirming(false); void mutate(`/patient/cases/${caseId}/arrived`, {}); }} onCancel={() => setConfirming(false)}/>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.8125rem] font-semibold text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-semibold text-ink-900">{children}</dd>
    </div>
  );
}

function balanceTone(state: string): StatusTone {
  return state === "PAID" ? "success" : state === "CHECKING" ? "info" : "warning";
}

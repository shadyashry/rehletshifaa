"use client";

import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
export type BankTransferData = { accountName: string; bankName: string; accountNumber: string; iban: string; swift: string; paymentReference: string };
export type TransferReportData = { id: string; reference: string; status: string; submittedAt: string; reason?: string | null };

/** As the backend accepts it (DEP-3): letters, digits (Arabic digits too) and the separators banks print, 4 to 64 characters. */
const REFERENCE = /^[A-Za-z0-9٠-٩۰-۹][A-Za-z0-9٠-٩۰-۹ ./_-]{2,62}[A-Za-z0-9٠-٩۰-۹]$/;

/**
 * The patient's payment step for the coordination deposit (DEP-3, owner decision 2026-10-13): the amount due with the
 * preliminary-estimate caveat, the method (online shown but not offered until a provider is chosen; bank transfer), the
 * platform account with the case number as payment reference, and the bank's transaction reference — mandatory, and the
 * only proof asked for. The backend decides that this step is owed; this component only collects the reference.
 */
export function PatientDepositPayment({ locale, caseId, currency, amountDue, totalDue, received, bank, transfer, busy, mutate }: {
  locale: Locale; caseId: string; currency: string; amountDue: number | null; totalDue: number | null; received: number | null;
  bank: BankTransferData; transfer?: TransferReportData | null; busy: boolean; mutate: Mutate;
}) {
  const t = useWorkCopy().myCare.payment;
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fieldId = useId(), whatId = useId(), whereId = useId(), errorId = useId(), onlineId = useId(), bankId = useId();
  const valid = REFERENCE.test(reference.trim());
  const showError = touched && !valid;
  const money = (n: number | null) => (n == null ? "—" : formatMoney(n, currency, locale));

  const rows: [string, string, boolean?][] = [
    [t.accountName, bank.accountName], [t.bankName, bank.bankName], [t.accountNumber, bank.accountNumber],
    [t.iban, bank.iban], [t.swift, bank.swift], [t.paymentReference, bank.paymentReference, true],
  ];

  return (
    <div className="mt-6 space-y-6">
      {transfer?.status === "REJECTED" && (
        <div role="alert" className="rounded-md bg-alert-50 px-4 py-3 text-[0.9375rem] leading-6 text-alert-800">
          <p className="font-semibold">{t.rejected}</p>
          {transfer.reason && <p dir="auto">{transfer.reason}</p>}
          <p>{t.rejectedNext}</p>
        </div>
      )}

      <section aria-labelledby={`${fieldId}-due`}>
        <h3 id={`${fieldId}-due`} className="label-micro text-ink-500">{t.amountDue}</h3>
        <p className="statement mt-1 text-brand-900 tabular-nums"><bdi dir="ltr">{money(amountDue)}</bdi></p>
        {received != null && received > 0 && (
          <p className="mt-1 text-[0.875rem] text-ink-600">
            {t.total} <bdi dir="ltr" className="tabular-nums">{money(totalDue)}</bdi> · {t.received} <bdi dir="ltr" className="tabular-nums">{money(received)}</bdi>
          </p>
        )}
        <p className="mt-3 flex gap-2.5 rounded-md border-s-4 border-sand-300 bg-sand-50 px-4 py-3 text-[0.875rem] leading-6 text-ink-800">
          <Info size={18} aria-hidden className="mt-0.5 flex-none text-sand-700"/>
          <span>{t.estimateNote}</span>
        </p>
      </section>

      <fieldset>
        <legend className="text-[0.9375rem] font-semibold text-ink-900">{t.method}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-not-allowed items-start gap-3 rounded-md border border-line px-4 py-3 text-ink-500">
            <input type="radio" name="deposit-method" value="ONLINE" disabled aria-describedby={onlineId} className="mt-1"/>
            <span><span className="block font-semibold">{t.online}</span><span id={onlineId} className="block text-[0.8125rem]">{t.onlineSoon}</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-brand-600 bg-white px-4 py-3 text-ink-900">
            <input type="radio" name="deposit-method" value="BANK_TRANSFER" checked readOnly aria-describedby={bankId} className="mt-1"/>
            <span><span className="block font-semibold">{t.bankTransfer}</span><span id={bankId} className="block text-[0.8125rem] text-ink-600">{t.bankTransferHint}</span></span>
          </label>
        </div>
      </fieldset>

      <section aria-labelledby={`${fieldId}-bank`}>
        <h3 id={`${fieldId}-bank`} className="text-[0.9375rem] font-semibold text-ink-900">{t.bankTitle}</h3>
        <dl className="mt-3 divide-y divide-line border-y border-line text-[0.9375rem]">
          {rows.map(([label, value, highlight]) => (
            <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5">
              <dt className="text-ink-600">{label}</dt>
              <dd translate="no" className={`min-w-0 select-all break-all font-semibold tabular-nums ${highlight ? "text-brand-800" : "text-ink-900"}`}><bdi dir="ltr">{value}</bdi></dd>
              {highlight && <dd className="w-full text-[0.8125rem] text-ink-600">{t.paymentReferenceHint}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <form noValidate onSubmit={event => {
        event.preventDefault();
        setTouched(true);
        if (!valid) { input.current?.focus(); return; }
        void mutate(`/patient/cases/${caseId}/deposit/transfer-reference`, { reference: reference.trim() });
      }}>
        <label htmlFor={fieldId} className="block text-[0.9375rem] font-semibold text-ink-900">
          {t.referenceLabel} <span className="text-alert-700" aria-hidden>*</span><span className="sr-only"> ({t.required})</span>
        </label>
        <p id={whatId} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.referenceWhat}</p>
        <p id={whereId} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.referenceWhere}</p>
        <input ref={input} id={fieldId} name="transferReference" translate="no" className="field mt-2 max-w-md" dir="ltr" autoComplete="off" spellCheck={false}
               required maxLength={64} value={reference} aria-invalid={showError || undefined}
               aria-describedby={`${whatId} ${whereId}${showError ? ` ${errorId}` : ""}`}
               onChange={event => setReference(event.target.value)} onBlur={() => setTouched(true)}/>
        <p id={errorId} aria-live="polite" className="mt-1.5 text-[0.875rem] text-alert-700">{showError ? t.referenceInvalid : ""}</p>
        <button type="submit" className="btn-primary mt-4" disabled={busy}>{t.submit}</button>
      </form>
    </div>
  );
}

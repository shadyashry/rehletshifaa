"use client";

import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
export type BankTransferData = { accountName: string; bankName: string; accountNumber: string; iban: string; swift: string; paymentReference: string };
export type TransferReportData = { id: string; reference: string; status: string; submittedAt: string; reason?: string | null; method?: string; agentName?: string | null };
type Method = "BANK_TRANSFER" | "AGENT_CASH";

/** As the backend accepts it (DEP-3): letters, digits (Arabic digits too) and the separators banks print, 4 to 64 characters. */
const REFERENCE = /^[A-Za-z0-9٠-٩۰-۹][A-Za-z0-9٠-٩۰-۹ ./_-]{2,62}[A-Za-z0-9٠-٩۰-۹]$/;

/**
 * The patient's payment step for the coordination deposit (DEP-3, owner decision 2026-10-13): the amount due with the
 * preliminary-estimate caveat, the method (online shown but not offered until a provider is chosen; bank transfer), the
 * platform account with the case number as payment reference, and the bank's transaction reference — mandatory, and the
 * only proof asked for. The backend decides that this step is owed; this component only collects the reference.
 * P0-4 corridor rail: a patient who cannot send a bank transfer pays cash through an agent instead and enters the
 * agent's name and receipt number; Finance verifies it the same way.
 */
export function PatientDepositPayment({ locale, caseId, currency, amountDue, totalDue, received, bank, transfer, busy, mutate }: {
  locale: Locale; caseId: string; currency: string; amountDue: number | null; totalDue: number | null; received: number | null;
  bank: BankTransferData; transfer?: TransferReportData | null; busy: boolean; mutate: Mutate;
}) {
  const t = useWorkCopy().myCare.payment;
  const [method, setMethod] = useState<Method>(transfer?.method === "AGENT_CASH" ? "AGENT_CASH" : "BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [agent, setAgent] = useState("");
  const [touched, setTouched] = useState(false);
  const [agentTouched, setAgentTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const agentInput = useRef<HTMLInputElement>(null);
  const fieldId = useId(), whatId = useId(), whereId = useId(), errorId = useId(), onlineId = useId(), bankId = useId();
  const agentId = useId(), agentHintId = useId(), agentErrorId = useId(), agentMethodId = useId();
  const cash = method === "AGENT_CASH";
  const valid = REFERENCE.test(reference.trim());
  const agentValid = !cash || agent.trim().length > 0;
  const showError = touched && !valid;
  const showAgentError = cash && agentTouched && !agentValid;
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
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex cursor-not-allowed items-start gap-3 rounded-md border border-line px-4 py-3 text-ink-500">
            <input type="radio" name="deposit-method" value="ONLINE" disabled aria-describedby={onlineId} className="mt-1"/>
            <span><span className="block font-semibold">{t.online}</span><span id={onlineId} className="block text-[0.8125rem]">{t.onlineSoon}</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-md border bg-white px-4 py-3 text-ink-900 ${cash ? "border-line" : "border-brand-600"}`}>
            <input type="radio" name="deposit-method" value="BANK_TRANSFER" checked={!cash} onChange={() => setMethod("BANK_TRANSFER")} aria-describedby={bankId} className="mt-1"/>
            <span><span className="block font-semibold">{t.bankTransfer}</span><span id={bankId} className="block text-[0.8125rem] text-ink-600">{t.bankTransferHint}</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-md border bg-white px-4 py-3 text-ink-900 ${cash ? "border-brand-600" : "border-line"}`}>
            <input type="radio" name="deposit-method" value="AGENT_CASH" checked={cash} onChange={() => setMethod("AGENT_CASH")} aria-describedby={agentMethodId} className="mt-1"/>
            <span><span className="block font-semibold">{t.agentCash}</span><span id={agentMethodId} className="block text-[0.8125rem] text-ink-600">{t.agentCashHint}</span></span>
          </label>
        </div>
      </fieldset>

      {cash ? (
        <p className="max-w-[65ch] text-[0.9375rem] leading-6 text-ink-800">
          {t.agentPayTo.split("{reference}")[0]}<bdi dir="ltr" translate="no" className="select-all font-semibold text-brand-800">{bank.paymentReference}</bdi>{t.agentPayTo.split("{reference}")[1] ?? ""}
        </p>
      ) : <section aria-labelledby={`${fieldId}-bank`}>
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
      </section>}

      <form noValidate onSubmit={event => {
        event.preventDefault();
        setTouched(true); setAgentTouched(true);
        if (!agentValid) { agentInput.current?.focus(); return; }
        if (!valid) { input.current?.focus(); return; }
        void mutate(`/patient/cases/${caseId}/deposit/transfer-reference`, cash
          ? { reference: reference.trim(), method: "AGENT_CASH", agentName: agent.trim() }
          : { reference: reference.trim() });
      }}>
        {cash && <div className="mb-5">
          <label htmlFor={agentId} className="block text-[0.9375rem] font-semibold text-ink-900">
            {t.agentLabel} <span className="text-alert-700" aria-hidden>*</span><span className="sr-only"> ({t.required})</span>
          </label>
          <p id={agentHintId} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.agentHint}</p>
          <input ref={agentInput} id={agentId} name="agentName" className="field mt-2 max-w-md" dir="auto" autoComplete="off" required maxLength={120}
                 value={agent} aria-invalid={showAgentError || undefined} aria-describedby={`${agentHintId}${showAgentError ? ` ${agentErrorId}` : ""}`}
                 onChange={event => setAgent(event.target.value)} onBlur={() => setAgentTouched(true)}/>
          <p id={agentErrorId} aria-live="polite" className="mt-1.5 text-[0.875rem] text-alert-700">{showAgentError ? t.agentRequired : ""}</p>
        </div>}
        <label htmlFor={fieldId} className="block text-[0.9375rem] font-semibold text-ink-900">
          {cash ? t.receiptLabel : t.referenceLabel} <span className="text-alert-700" aria-hidden>*</span><span className="sr-only"> ({t.required})</span>
        </label>
        <p id={whatId} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{cash ? t.receiptWhat : t.referenceWhat}</p>
        {!cash && <p id={whereId} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.referenceWhere}</p>}
        <input ref={input} id={fieldId} name="transferReference" translate="no" className="field mt-2 max-w-md" dir="ltr" autoComplete="off" spellCheck={false}
               required maxLength={64} value={reference} aria-invalid={showError || undefined}
               aria-describedby={`${whatId}${cash ? "" : ` ${whereId}`}${showError ? ` ${errorId}` : ""}`}
               onChange={event => setReference(event.target.value)} onBlur={() => setTouched(true)}/>
        <p id={errorId} aria-live="polite" className="mt-1.5 text-[0.875rem] text-alert-700">{showError ? (cash ? t.receiptInvalid : t.referenceInvalid) : ""}</p>
        <button type="submit" className="btn-primary mt-4" disabled={busy}>{cash ? t.submitReceipt : t.submit}</button>
      </form>
    </div>
  );
}

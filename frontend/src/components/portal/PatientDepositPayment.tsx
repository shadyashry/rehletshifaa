"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, Copy, Info } from "lucide-react";

import { useWorkCopy } from "@/components/portal/portal-copy";
import type { Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { fillTemplate } from "@/lib/portal-labels";

type Mutate = (path: string, body?: unknown, method?: string) => Promise<unknown>;
export type BankTransferData = { accountName: string; bankName: string; accountNumber: string; iban: string; swift: string; paymentReference: string };
export type TransferReportData = { id: string; reference: string; status: string; submittedAt: string; reason?: string | null; method?: string; agentName?: string | null };
type Method = "BANK_TRANSFER" | "AGENT_CASH";

/** As the backend accepts it (DEP-3): letters, digits (Arabic digits too) and the separators banks print, 4 to 64 characters. */
const REFERENCE = /^[A-Za-z0-9٠-٩۰-۹][A-Za-z0-9٠-٩۰-۹ ./_-]{2,62}[A-Za-z0-9٠-٩۰-۹]$/;

/** An IBAN as banks print it, in groups of four, so it can be checked by eye against a banking app; Copy takes the raw value. */
const grouped = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");

/**
 * The patient's payment step for the coordination deposit (DEP-3, owner decision 2026-10-13), drawn as a payment slip in
 * two numbered parts so the field follows the details it depends on: **1** pay (the platform account with the case number
 * as payment reference, or the agent), **2** enter the bank's transaction reference (or the agent's receipt) — mandatory,
 * and the only proof asked for. The amount due leads, with the preliminary-estimate caveat as a quiet note; online payment
 * is still shown, as one line, until a provider is chosen. Account number, IBAN, SWIFT and the payment reference each have
 * a Copy control (D-2), so nobody retypes them on a phone. The backend decides that this step is owed; this component only
 * collects the reference. P0-4 corridor rail: a patient who cannot send a bank transfer pays cash through an agent and
 * enters the agent's name and receipt number; Finance verifies it the same way.
 */
export function PatientDepositPayment({ locale, caseId, currency, amountDue, totalDue, received, bank, transfer, busy, mutate }: {
  locale: Locale; caseId: string; currency: string; amountDue: number | null; totalDue: number | null; received: number | null;
  bank: BankTransferData; transfer?: TransferReportData | null; busy: boolean; mutate: Mutate;
}) {
  const t = useWorkCopy().myCare.payment;
  const [method, setMethod] = useState<Method>(transfer?.method === "AGENT_CASH" ? "AGENT_CASH" : "BANK_TRANSFER");
  const [reference, setReference] = useState("");
  // A rejected agent payment keeps the agent the patient named; only the receipt number is entered again.
  const [agent, setAgent] = useState(transfer?.status === "REJECTED" && transfer.method === "AGENT_CASH" ? transfer.agentName ?? "" : "");
  const [touched, setTouched] = useState(false);
  const [agentTouched, setAgentTouched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const agentInput = useRef<HTMLInputElement>(null);
  const fieldId = useId(), whatId = useId(), whereId = useId(), errorId = useId();
  const agentId = useId(), agentHintId = useId(), agentErrorId = useId();
  const cash = method === "AGENT_CASH";
  const valid = REFERENCE.test(reference.trim());
  const agentValid = !cash || agent.trim().length > 0;
  const showError = touched && !valid;
  const showAgentError = cash && agentTouched && !agentValid;
  const referenceError = !reference.trim() ? (cash ? t.receiptMissing : t.referenceMissing) : cash ? t.receiptInvalid : t.referenceInvalid;
  const money = (n: number | null) => (n == null ? "—" : formatMoney(n, currency, locale));
  const copier = useCopy();

  function choose(next: Method) {
    if (next === method) return;
    // The other method asks for a different number: its errors start fresh.
    setMethod(next); setTouched(false); setAgentTouched(false);
  }

  const rows: { label: string; value: string; shown?: string; copy?: boolean; highlight?: boolean }[] = [
    { label: t.accountName, value: bank.accountName }, { label: t.bankName, value: bank.bankName },
    { label: t.accountNumber, value: bank.accountNumber, copy: true }, { label: t.iban, value: bank.iban, shown: grouped(bank.iban), copy: true },
    { label: t.swift, value: bank.swift, copy: true }, { label: t.paymentReference, value: bank.paymentReference, copy: true, highlight: true },
  ];
  const copyControl = (label: string, value: string) => (
    <CopyButton copied={copier.copied?.label === label} label={label} text={copier.copied?.label === label ? t.copied : t.copy}
                onCopy={() => void copier.copy(label, value)}/>
  );

  return (
    <div className="mt-6 space-y-7">
      {transfer?.status === "REJECTED" && (
        <div role="alert" className="flex items-start gap-2.5 border-y border-line py-3 text-[0.9375rem] leading-6">
          <CircleAlert size={18} aria-hidden className="mt-0.5 flex-none text-alert-700"/>
          <div>
            <p className="font-semibold text-alert-800">{t.rejected}</p>
            <p className="text-ink-700">{t.rejectedReference}: <bdi dir="ltr" translate="no" className="font-semibold text-ink-900">{transfer.reference}</bdi></p>
            {transfer.reason && <p dir="auto" className="text-ink-800">{transfer.reason}</p>}
            <p className="text-ink-700">{t.rejectedNext}</p>
          </div>
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
        {/* The estimate caveat as a quiet note: an icon and a hairline, no tinted panel. */}
        <p className="mt-3 flex gap-2.5 border-t border-line pt-3 text-[0.875rem] leading-6 text-ink-700">
          <Info size={18} aria-hidden className="mt-0.5 flex-none text-brand-600"/>
          <span>{t.estimateNote}</span>
        </p>
      </section>

      <fieldset className="min-w-0">
        <legend className="text-[0.9375rem] font-semibold text-ink-900">{t.method}</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <MethodCard name="deposit-method" value="BANK_TRANSFER" checked={!cash} onChange={() => choose("BANK_TRANSFER")} title={t.bankTransfer} hint={t.bankTransferHint}/>
          <MethodCard name="deposit-method" value="AGENT_CASH" checked={cash} onChange={() => choose("AGENT_CASH")} title={t.agentCash} hint={t.agentCashHint}/>
        </div>
        {/* Still shown, as decided, but as one quiet trailing line: it cannot be chosen yet. */}
        <label className="mt-2 flex min-h-11 cursor-not-allowed items-center gap-x-2.5 text-[0.875rem] text-ink-500">
          <input type="radio" name="deposit-method" value="ONLINE" disabled className="h-4 w-4"/>
          <span><span className="font-semibold">{t.online}</span> · <span>{t.onlineSoon}</span></span>
        </label>
      </fieldset>

      {/* 1 — pay: the account (or the agent), with the case number as the payment reference. */}
      <section aria-labelledby={`${fieldId}-pay`}>
        <PartHeading id={`${fieldId}-pay`} number={1}>{cash ? t.stepAgent : t.bankTitle}</PartHeading>
        {cash ? (
          <p className="mt-3 max-w-[65ch] text-[0.9375rem] leading-6 text-ink-800">
            {t.agentPayTo.split("{reference}")[0]}<bdi dir="ltr" translate="no" className="select-all whitespace-nowrap font-semibold text-brand-800">{bank.paymentReference}</bdi>{t.agentPayTo.split("{reference}")[1] ?? ""}
            <span className="ms-1 inline-flex align-middle">{copyControl(t.paymentReference, bank.paymentReference)}</span>
          </p>
        ) : (
          <dl className="mt-3 divide-y divide-line border-y border-line text-[0.9375rem]">
            {rows.map(({ label, value, shown, copy, highlight }) => (
              // Phones: label above value (Copy at the line end); from 640px, label and value share the line.
              <div key={label} className="grid gap-0.5 py-2 sm:flex sm:items-center sm:justify-between sm:gap-x-4">
                <dt className="text-ink-600">{label}</dt>
                <dd className={`flex min-h-11 min-w-0 items-center justify-between gap-2 sm:justify-end ${copy ? "" : "sm:min-h-0"}`}>
                  <span translate="no" className={`min-w-0 select-all font-semibold tabular-nums ${highlight ? "text-brand-800" : "text-ink-900"}`}><bdi dir="ltr">{shown ?? value}</bdi></span>
                  {copy && copyControl(label, value)}
                </dd>
                {highlight && <dd className="w-full text-[0.875rem] text-ink-600">{t.paymentReferenceHint}</dd>}
              </div>
            ))}
          </dl>
        )}
        {/* One live region; each copy inserts a fresh node, so a repeat is announced too. */}
        <p role="status" className="sr-only">
          {copier.copied ? <span key={copier.copied.n}>{fillTemplate(t.copiedAnnounce, { label: copier.copied.label })}</span>
            : copier.failed ? <span key={copier.failed.n}>{fillTemplate(t.copyFailed, { label: copier.failed.label })}</span> : null}
        </p>
        {copier.failed && <p className="mt-2 text-[0.875rem] text-ink-600">{fillTemplate(t.copyFailed, { label: copier.failed.label })}</p>}
      </section>

      {/* 2 — the bank's transaction reference (or the agent's receipt): the only proof asked for. */}
      <section aria-labelledby={`${fieldId}-proof`}>
        <PartHeading id={`${fieldId}-proof`} number={2}>{cash ? t.stepReceipt : t.stepReference}</PartHeading>
        <form className="mt-3" noValidate onSubmit={event => {
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
            <p id={agentErrorId} aria-live="polite" className="mt-1.5 text-[0.875rem] font-semibold text-alert-800">{showAgentError ? t.agentRequired : ""}</p>
          </div>}
          <label htmlFor={fieldId} className="block text-[0.9375rem] font-semibold text-ink-900">
            {cash ? t.receiptLabel : t.referenceLabel} <span className="text-alert-700" aria-hidden>*</span><span className="sr-only"> ({t.required})</span>
          </label>
          <p id={whatId} className="mt-1 max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{cash ? t.receiptWhat : t.referenceWhat}</p>
          {/* Where banks print it: one tap away, so the field stays close to the account details on a phone. */}
          {!cash && (
            <details className="group mt-1">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-[0.875rem] font-semibold text-brand-700 [&::-webkit-details-marker]:hidden">
                {t.referenceWhereToggle}
              </summary>
              <p id={whereId} className="max-w-[65ch] text-[0.875rem] leading-6 text-ink-600">{t.referenceWhere}</p>
            </details>
          )}
          <input ref={input} id={fieldId} name="transferReference" translate="no" className="field mt-2 max-w-md" dir="ltr" autoComplete="off" spellCheck={false}
                 autoCapitalize="characters" autoCorrect="off"
                 required maxLength={64} value={reference} aria-invalid={showError || undefined}
                 aria-describedby={`${whatId}${cash ? "" : ` ${whereId}`}${showError ? ` ${errorId}` : ""}`}
                 onChange={event => setReference(event.target.value)} onBlur={() => setTouched(true)}/>
          <p id={errorId} aria-live="polite" className="mt-1.5 text-[0.875rem] font-semibold text-alert-800">{showError ? referenceError : ""}</p>
          <button type="submit" className="btn-primary mt-4" disabled={busy} aria-busy={busy || undefined}>{busy ? t.sending : cash ? t.submitReceipt : t.submit}</button>
        </form>
      </section>
    </div>
  );
}

/** A numbered part of the slip, numbered like the journey. */
function PartHeading({ id, number, children }: { id: string; number: number; children: ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-3 text-[1.0625rem] font-semibold text-brand-900">
      <span aria-hidden className="journey-marker flex-none">{number}</span>
      <span>{children}</span>
    </h3>
  );
}

/** A DESIGN.md choice card for the payment method: an 8px card with its own radio; checked, the petrol edge, wash and halo. */
function MethodCard({ name, value, checked, onChange, title, hint }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; hint: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-ink-350 bg-white px-4 py-3 text-ink-900 transition-[transform,border-color,box-shadow,background-color] motion-safe:hover:-translate-y-px hover:border-brand-300 has-[:checked]:border-[var(--choice-checked-border)] has-[:checked]:bg-[var(--choice-checked-bg)] has-[:checked]:shadow-[0_0_0_3px_var(--color-brand-100)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-600">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 h-4 w-4 flex-none accent-brand-600 focus-visible:outline-none"/>
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-semibold">{title}</span>
        <span className="block text-[0.875rem] leading-5 text-ink-600">{hint}</span>
      </span>
    </label>
  );
}

/** A small, quiet Copy control (≥44px target); its name is its visible word plus what it copies, so voice control can say it. */
function CopyButton({ copied, label, text, onCopy }: { copied: boolean; label: string; text: string; onCopy: () => void }) {
  return (
    <button type="button" onClick={onCopy}
            className="inline-flex min-h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
      {copied ? <Check size={16} aria-hidden/> : <Copy size={16} aria-hidden/>}
      <span>{text}</span><span className="sr-only"> {label}</span>
    </button>
  );
}

/**
 * Clipboard copy with a short "Copied" state. The control is always drawn (no shift after hydration); where the browser
 * cannot copy, the patient is told to select the value instead. Each result carries a counter so a repeat is announced.
 */
function useCopy() {
  const [copied, setCopied] = useState<{ label: string; n: number } | null>(null);
  const [failed, setFailed] = useState<{ label: string; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = useRef(0);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function settle() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setCopied(null); setFailed(null); }, 4000);
  }
  async function copy(label: string, value: string) {
    const n = ++count.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(value);
      setFailed(null); setCopied({ label, n });
    } catch { setCopied(null); setFailed({ label, n }); }
    settle();
  }
  return { copied, failed, copy };
}

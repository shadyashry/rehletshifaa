"use client";

import { useId, useRef } from "react";
import { useWorkCopy } from "./portal-copy";
import { ActForm, AmountInput, readAmount } from "./panel-parts";
import { money } from "./portal-model";
import { fillTemplate } from "@/lib/portal-labels";
import type { Locale } from "@/lib/i18n";

export const REFUND_REASONS = ["PATIENT_CANCELLED", "PATIENT_NO_SHOW", "PLATFORM_CANCELLED", "FACILITY_CANCELLED", "CONSULTANT_CANCELLED", "MEDICALLY_DECLINED", "SETTLEMENT_CREDIT"] as const;
export type RefundReason = typeof REFUND_REASONS[number];
export type RefundRequest = { amountEgp: number; reasonCode: RefundReason; reason?: string; idempotencyKey: string };

const request = (data: FormData) => {
  const code = String(data.get("reasonCode"));
  return { amountEgp: readAmount(data.get("amount")), reasonCode: code as RefundReason, reason: String(data.get("reason") || "").trim() || undefined };
};

/**
 * Finance confirms the actual amount and the typed policy reason together before recording money leaving. UX 4-1: on `ActForm`,
 * so a refusal is said at the form; one idempotency key per refund (its amount and reason), kept through a refused or timed-out attempt,
 * so a retry can never record it twice, even with its free-text detail corrected; a changed amount or reason is a new refund.
 */
export function RefundForm({ locale, busy, onRecord }: { locale: Locale; busy: boolean; onRecord: (request: RefundRequest) => Promise<unknown> }) {
  const work = useWorkCopy(); const g = work.caseView.deposit; const confirm = work.confirm; const forms = work.admission.forms;
  const id = useId();
  const key = useRef<{ said: string; id: string } | null>(null);
  const keyFor = (said: string) => {
    if (key.current?.said !== said) key.current = { said, id: crypto.randomUUID() };
    return key.current.id;
  };
  return (
    <ActForm className="mt-2 grid gap-3 sm:grid-cols-[minmax(8rem,10rem)_minmax(0,1fr)]" refused={forms.refused} retry={forms.refusedRetry}
      confirm={{
        title: data => fillTemplate(confirm.refundTitle, { amount: `⁨${money(request(data).amountEgp, "EGP", locale)}⁩` }),
        body: data => { const r = request(data); return `${confirm.refundBody} ${g.refundReasons[r.reasonCode] ?? ""}${r.reason ? ` · ⁨${r.reason}⁩` : ""}`; },
        confirm: confirm.refund, cancel: confirm.cancel,
      }}
      action={data => {
        const r = request(data);
        return onRecord({ ...r, idempotencyKey: keyFor(`${r.amountEgp}|${r.reasonCode}`) }).then(result => { if (result) key.current = null; return !!result; });
      }}>
      <div><label htmlFor={`${id}-amount`} className="block text-sm font-semibold">{g.amount}</label><AmountInput id={`${id}-amount`} name="amount" invalid={forms.amountInvalid}/></div>
      <label className="block text-sm font-semibold">{g.reason}
        <select className="field" name="reasonCode" required defaultValue=""><option value="" disabled>{g.chooseReason}</option>{REFUND_REASONS.map(reason => <option key={reason} value={reason}>{g.refundReasons[reason]}</option>)}</select>
      </label>
      <label className="block text-sm font-semibold sm:col-span-2">{g.reasonDetail}<input className="field" name="reason" maxLength={500} dir="auto" autoComplete="off"/></label>
      <div className="sm:col-span-2"><button className="btn-secondary" disabled={busy}>{g.refund}</button></div>
    </ActForm>
  );
}

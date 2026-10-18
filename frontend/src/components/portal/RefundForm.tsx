"use client";

import { useState } from "react";
import { useWorkCopy } from "./portal-copy";
import { ConfirmDialog } from "./portal-ui";
import { money } from "./portal-model";
import { fillTemplate } from "@/lib/portal-labels";
import type { Locale } from "@/lib/i18n";

export const REFUND_REASONS = ["PATIENT_CANCELLED", "PATIENT_NO_SHOW", "PLATFORM_CANCELLED", "FACILITY_CANCELLED", "CONSULTANT_CANCELLED", "MEDICALLY_DECLINED", "SETTLEMENT_CREDIT"] as const;
export type RefundReason = typeof REFUND_REASONS[number];
export type RefundRequest = { amountEgp: number; reasonCode: RefundReason; reason?: string; idempotencyKey: string };

/** Finance confirms the actual amount and the typed policy reason together before recording money leaving. */
export function RefundForm({ locale, busy, onRecord }: { locale: Locale; busy: boolean; onRecord: (request: RefundRequest) => Promise<unknown> }) {
  const work = useWorkCopy(); const g = work.caseView.deposit; const confirm = work.confirm;
  const [pending, setPending] = useState<{ form: HTMLFormElement; request: RefundRequest } | null>(null);
  return <>
    <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      const code = String(data.get("reasonCode"));
      if (!REFUND_REASONS.includes(code as RefundReason)) return;
      setPending({ form, request: { amountEgp: Number(data.get("amount")), reasonCode: code as RefundReason, reason: String(data.get("reason") || "").trim() || undefined, idempotencyKey: crypto.randomUUID() } });
    }}>
      <label className="text-[0.8125rem] font-bold">{g.amount}<input className="field w-28" name="amount" type="number" min="0.01" step="0.01" required dir="ltr" /></label>
      <label className="text-[0.8125rem] font-bold">{g.reason}<select className="field" name="reasonCode" required defaultValue=""><option value="" disabled>{g.chooseReason}</option>{REFUND_REASONS.map(reason => <option key={reason} value={reason}>{g.refundReasons[reason]}</option>)}</select></label>
      <label className="flex-1 text-[0.8125rem] font-bold">{g.reasonDetail}<input className="field" name="reason" maxLength={500} /></label>
      <button className="btn-secondary" disabled={busy}>{g.refund}</button>
    </form>
    {pending && <ConfirmDialog title={fillTemplate(confirm.refundTitle, { amount: money(pending.request.amountEgp, "EGP", locale) })} body={`${confirm.refundBody} ${g.refundReasons[pending.request.reasonCode]}${pending.request.reason ? ` · ${pending.request.reason}` : ""}`} confirm={confirm.refund} cancel={confirm.cancel}
      onCancel={() => setPending(null)} onConfirm={() => { const current = pending; setPending(null); void onRecord(current.request).then(result => { if (result) current.form.reset(); }); }} />}
  </>;
}

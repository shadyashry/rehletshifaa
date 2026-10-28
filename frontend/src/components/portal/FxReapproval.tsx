"use client";

import { useState } from "react";

import type { PriceCopy } from "@/components/PriceTransparency";
import { ConfirmDialog } from "@/components/portal/portal-ui";
import type { Mutate, ProposalCommercial } from "@/components/portal/portal-model";
import { intlLocale, type Locale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";

type Choice = "confirm" | "reprice";

/**
 * Finance's decision when a final quote's exchange rate has moved beyond the policy band: keep the frozen rate or
 * re-release at today's rate. The patient cannot accept until one is chosen; each choice is confirmed first, because
 * re-releasing replaces the patient's link. Shows what the quote was frozen at (today's figure is not on the view).
 */
export function FxReapproval({ locale, copy, caseId, versionId, currency, total, commercial, busy, mutate }: {
  locale: Locale; copy: PriceCopy["fxReapproval"]; caseId: string; versionId: string; currency: string; total: number;
  commercial?: ProposalCommercial | null; busy: boolean; mutate: Mutate;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const base = `/finance/cases/${caseId}/final-quotes/${versionId}/fx-rate`;
  const rate = commercial?.fxRate == null ? null : new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 6 }).format(commercial.fxRate);
  const todayRate = commercial?.fxReapprovalRate == null ? null : new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 6 }).format(commercial.fxReapprovalRate);
  const todayTotal = commercial?.fxReapprovalTotal ?? null;
  const change = todayTotal == null || total === 0 ? null : (todayTotal - total) / total;
  const percent = change == null ? null : new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(change);
  const rateDate = commercial?.fxRateDate ? new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${commercial.fxRateDate}T00:00:00Z`)) : null;

  return (
    <section aria-labelledby="fx-reapproval-title" className="card mt-6 p-5">
      <h3 id="fx-reapproval-title" className="title">{copy.title}</h3>
      <p className="mt-2 max-w-[64ch] text-[0.9375rem] leading-6 text-ink-700">{copy.body}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] tabular-nums sm:grid-cols-2">
        <div>
          <dt className="text-[0.8125rem] font-semibold text-ink-500">{copy.frozen}</dt>
          <dd className="font-bold text-ink-900"><bdi dir="ltr">{formatMoney(total, currency, locale)}</bdi></dd>
        </div>
        {todayTotal != null && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{copy.today}</dt>
            <dd className="font-bold text-ink-900"><bdi dir="ltr">{formatMoney(todayTotal, currency, locale)}</bdi>{percent && <span className="font-normal text-ink-600"> · {copy.difference} <bdi dir="ltr">{percent}</bdi></span>}</dd>
          </div>
        )}
        {todayRate && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{copy.todayRate}</dt>
            <dd className="font-bold text-ink-900"><bdi dir="ltr">{todayRate}</bdi></dd>
          </div>
        )}
        {rate && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{copy.frozenRate}</dt>
            <dd className="font-bold text-ink-900"><bdi dir="ltr">{rate}</bdi>{rateDate && <span className="font-normal text-ink-600"> · <bdi>{rateDate}</bdi></span>}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setChoice("confirm")}>{copy.keep}</button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => setChoice("reprice")}>{copy.reprice}</button>
      </div>
      {choice && (
        <ConfirmDialog
          title={choice === "confirm" ? copy.keepTitle : copy.repriceTitle}
          body={choice === "confirm" ? copy.keepBody : copy.repriceBody}
          confirm={choice === "confirm" ? copy.keep : copy.reprice}
          cancel={copy.cancel}
          onCancel={() => setChoice(null)}
          onConfirm={() => { const chosen = choice; setChoice(null); void mutate(`${base}/${chosen}`); }}
        />
      )}
    </section>
  );
}

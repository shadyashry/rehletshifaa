"use client";

import { formatMoney } from "@/lib/money";
import { intlLocale, type Locale } from "@/lib/i18n";
import { fillTemplate } from "@/lib/portal-labels";
import { useWorkCopy } from "@/components/portal/portal-copy";
import { ActForm, Money, quotedRate } from "@/components/portal/panel-parts";
import { currencyName } from "@/components/portal/ClinicalDecision";
import { StatusBadge } from "@/components/portal/StatusBadge";
import type { ProposalCommercial } from "@/components/portal/portal-model";

type Line = ProposalCommercial["lines"][number];

/**
 * QA #19 / #20 (A4): what Finance approves, in the one place it approves it. Each line says whether its price comes from the
 * Consultant's approved list or was entered by hand (the reason Finance is asked), with the Consultant's EGP base price beside
 * the patient's price; then the margin the policy adds and the totals. The approve button is here and nowhere else.
 * UX 4-0: the copy is the portal's (en + ar); approving asks first, with the patient's total in the question; on a phone each
 * line is a short block instead of a five-column table; the rate reads the way Finance quotes it (1 USD = EGP 49.0196).
 */
export function FinanceApproval({ locale, commercial, busy, approveLabel, feeLabel, onApprove }: {
  locale: Locale; commercial: ProposalCommercial; busy: boolean; approveLabel: string; onApprove: () => Promise<unknown>;
  /** The patient-facing name of the platform's fee line (its stored description is English). */
  feeLabel?: string;
}) {
  const work = useWorkCopy();
  const t = work.financeApproval;
  const egp = (n?: number | null) => (n == null ? "—" : formatMoney(n, "EGP", locale));
  const quoted = (n?: number | null) => (n == null ? "—" : formatMoney(n, commercial.currency, locale));
  const foreign = commercial.currency !== "EGP";
  const inCurrency = fillTemplate(t.inCurrency, { currency: currencyName(commercial.currency, locale) });
  const percent = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 2 }).format(commercial.marginRate ?? 0);
  const manual = commercial.lines.filter(line => line.source === "MANUAL").length;
  const policy = commercial.policyName ? fillTemplate(t.policy, { name: `⁨${commercial.policyName}⁩`, version: String(commercial.policyVersion ?? "") }) : t.noPolicy;
  const rate = quotedRate(locale, commercial.currency, commercial.fxRate);
  const name = (line: Line) => `${line.source === "PLATFORM" ? feeLabel ?? line.description : line.description}${line.quantity > 1 ? ` × ${line.quantity}` : ""}`;
  const source = (line: Line) => line.source === "MANUAL" ? <StatusBadge tone="warning">{t.manual}</StatusBadge>
    : <span className="text-[0.8125rem] text-ink-600">{line.source === "PLATFORM" ? t.platform
      : line.source === "FACILITY_PACKAGE" ? <>{t.facilityPackage}{line.facilityName && <> · <bdi>{line.facilityName}</bdi></>}</> : t.catalogue}</span>;

  return (
    <div className="mt-4">
      <p className="text-[0.875rem] text-ink-700">{manual === 0 ? t.intro : manual === 1 ? t.introManualOne : fillTemplate(t.introManual, { count: new Intl.NumberFormat(intlLocale(locale)).format(manual) })}</p>

      {/* A phone reads each line as a short block: the service, where its price comes from, then the two prices. */}
      <ul className="mt-3 divide-y divide-line border-y border-line sm:hidden" aria-label={t.caption}>
        {commercial.lines.map(line => (
          <li key={line.id} className="py-2.5 text-[0.875rem]">
            <p className="font-semibold text-ink-900">{name(line)}</p>
            <div className="mt-1">{source(line)}</div>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
              <div><dt className="text-[0.8125rem] text-ink-500">{t.base}</dt><dd className="text-ink-800"><Money>{egp(line.baseEgp)}</Money></dd></div>
              <div><dt className="text-[0.8125rem] text-ink-500">{t.patient}</dt><dd className="font-semibold text-ink-900"><Money>{egp(line.patientEgp)}</Money></dd></div>
              {foreign && <div><dt className="text-[0.8125rem] text-ink-500">{inCurrency}</dt><dd className="text-ink-800"><Money>{quoted(line.displayUnitPrice)}</Money></dd></div>}
            </dl>
          </li>
        ))}
      </ul>
      {/* A region, so a keyboard can scroll the table when it is wider than its column. */}
      <div role="region" aria-label={t.caption} tabIndex={0} className="mt-3 hidden overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:block">
        <table className="w-full border-collapse text-[0.875rem] tabular-nums">
          <caption className="sr-only">{t.caption}</caption>
          <thead>
            <tr className="border-b border-line-strong text-[0.8125rem] text-ink-500">
              <th scope="col" className="py-2 pe-3 text-start font-semibold">{t.service}</th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">{t.source}</th>
              <th scope="col" className="py-2 pe-3 text-end font-semibold">{t.base}</th>
              <th scope="col" className="py-2 pe-3 text-end font-semibold">{t.patient}</th>
              {foreign && <th scope="col" className="py-2 text-end font-semibold">{inCurrency}</th>}
            </tr>
          </thead>
          <tbody>
            {commercial.lines.map(line => (
              <tr key={line.id} className="border-b border-line align-baseline">
                <th scope="row" className="py-2 pe-3 text-start font-normal text-ink-800">{name(line)}</th>
                <td className="py-2 pe-3">{source(line)}</td>
                <td className="py-2 pe-3 text-end whitespace-nowrap"><Money>{egp(line.baseEgp)}</Money></td>
                <td className="py-2 pe-3 text-end whitespace-nowrap"><Money>{egp(line.patientEgp)}</Money></td>
                {foreign && <td className="py-2 text-end whitespace-nowrap"><Money>{quoted(line.displayUnitPrice)}</Money></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] tabular-nums sm:grid-cols-2">
        <div><dt className="text-[0.8125rem] font-semibold text-ink-500">{t.baseTotal}</dt><dd className="font-bold text-ink-900"><Money>{egp(commercial.baseTotalEgp)}</Money></dd></div>
        <div>
          <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.margin}</dt>
          <dd className="font-bold text-ink-900"><Money>{egp(commercial.marginEgp)}</Money> <span className="font-normal text-ink-600">· {percent}</span></dd>
          <dd className={`text-[0.8125rem] ${commercial.policyName ? "text-ink-500" : "font-semibold text-status-warning-fg"}`}>{policy}</dd>
        </div>
        <div><dt className="text-[0.8125rem] font-semibold text-ink-500">{t.patientTotal}</dt><dd className="font-bold text-brand-900"><Money>{egp(commercial.patientTotalEgp)}</Money></dd></div>
        {foreign && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{inCurrency}</dt>
            <dd className="font-bold text-brand-900"><Money>{quoted(commercial.displayTotal)}</Money></dd>
            <dd className="text-[0.8125rem] text-ink-500">{rate == null ? t.rateLater : fillTemplate(t.rateFixed, { rate })}</dd>
          </div>
        )}
      </dl>
      {/* Approving asks first, and a refusal is said here, above the button, not only in the page's banner. */}
      <ActForm className="mt-4" refused={work.admission.forms.refused} retry={work.admission.forms.refusedRetry} action={() => onApprove().then(result => !!result)}
               confirm={{ title: () => fillTemplate(t.approveTitle, { amount: `⁦${egp(commercial.patientTotalEgp)}⁩` }), body: t.approveBody, confirm: approveLabel, cancel: work.confirm.cancel }}>
        <button className="btn-primary" disabled={busy}>{approveLabel}</button>
      </ActForm>
    </div>
  );
}

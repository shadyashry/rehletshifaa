"use client";

import { formatMoney } from "@/lib/money";
import { intlLocale, type Locale } from "@/lib/i18n";
import type { ProposalCommercial } from "@/components/portal/portal-model";

/**
 * QA #19 / #20 (A4): what Finance approves, in the one place it approves it. Each line says whether its price comes from the
 * Consultant's approved list or was entered by hand (the reason Finance is asked), with the Consultant's EGP base price beside
 * the patient's price; then the margin the policy adds and the totals. The approve button is here and nowhere else.
 */
export function FinanceApproval({ locale, commercial, busy, approveLabel, onApprove }: {
  locale: Locale; commercial: ProposalCommercial; busy: boolean; approveLabel: string; onApprove: () => void;
}) {
  const t = copy[locale];
  const egp = (n?: number | null) => (n == null ? "—" : formatMoney(n, "EGP", locale));
  const quoted = (n?: number | null) => (n == null ? "—" : formatMoney(n, commercial.currency, locale));
  const foreign = commercial.currency !== "EGP";
  const percent = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 2 }).format(commercial.marginRate ?? 0);
  const manual = commercial.lines.filter(line => line.source === "MANUAL").length;
  const policy = commercial.policyName
    ? t.policy.replace("{name}", commercial.policyName).replace("{version}", String(commercial.policyVersion ?? ""))
    : t.noPolicy;
  const rate = commercial.fxRate == null ? null : new Intl.NumberFormat(intlLocale(locale), { maximumSignificantDigits: 6 }).format(commercial.fxRate);

  return (
    <div className="mt-4">
      <p className="text-[0.875rem] text-ink-700">{manual === 0 ? t.intro : (manual === 1 ? t.introManualOne : t.introManual).replace("{count}", new Intl.NumberFormat(intlLocale(locale)).format(manual))}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-[0.85rem] tabular-nums">
          <caption className="sr-only">{t.caption}</caption>
          <thead>
            <tr className="border-b border-line-strong text-[0.8125rem] text-ink-500">
              <th scope="col" className="py-2 pe-3 text-start font-semibold">{t.service}</th>
              <th scope="col" className="py-2 pe-3 text-start font-semibold">{t.source}</th>
              <th scope="col" className="py-2 pe-3 text-end font-semibold">{t.base}</th>
              <th scope="col" className="py-2 pe-3 text-end font-semibold">{t.patient}</th>
              {foreign && <th scope="col" className="py-2 text-end font-semibold">{t.inCurrency.replace("{currency}", commercial.currency)}</th>}
            </tr>
          </thead>
          <tbody>
            {commercial.lines.map(line => (
              <tr key={line.id} className="border-b border-line align-baseline">
                <td className="py-2 pe-3 text-ink-800">{line.description}{line.quantity > 1 ? ` × ${line.quantity}` : ""}</td>
                <td className="py-2 pe-3">
                  {line.source === "MANUAL"
                    ? <span className="rounded bg-status-warning-surface px-1.5 py-0.5 text-[0.8125rem] font-bold text-status-warning-fg">{t.manual}</span>
                    : line.source === "FACILITY_PACKAGE" ? <span className="text-[0.8125rem] text-ink-600">{t.facilityPackage}{line.facilityName ? ` · ${line.facilityName}` : ""}</span>
                    : <span className="text-[0.8125rem] text-ink-600">{t.catalogue}</span>}
                </td>
                <td className="py-2 pe-3 text-end whitespace-nowrap"><bdi dir="ltr">{egp(line.baseEgp)}</bdi></td>
                <td className="py-2 pe-3 text-end whitespace-nowrap"><bdi dir="ltr">{egp(line.patientEgp)}</bdi></td>
                {foreign && <td className="py-2 text-end whitespace-nowrap"><bdi dir="ltr">{quoted(line.displayUnitPrice)}</bdi></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-[0.875rem] tabular-nums sm:grid-cols-2">
        <div><dt className="text-[0.8125rem] font-semibold text-ink-500">{t.baseTotal}</dt><dd className="font-bold text-ink-900"><bdi dir="ltr">{egp(commercial.baseTotalEgp)}</bdi></dd></div>
        <div>
          <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.margin}</dt>
          <dd className="font-bold text-ink-900"><bdi dir="ltr">{egp(commercial.marginEgp)}</bdi> <span className="font-normal text-ink-600">· {percent}</span></dd>
          <dd className={`text-[0.8125rem] ${commercial.policyName ? "text-ink-500" : "font-semibold text-status-warning-fg"}`}>{policy}</dd>
        </div>
        <div><dt className="text-[0.8125rem] font-semibold text-ink-500">{t.patientTotal}</dt><dd className="font-bold text-brand-900"><bdi dir="ltr">{egp(commercial.patientTotalEgp)}</bdi></dd></div>
        {foreign && (
          <div>
            <dt className="text-[0.8125rem] font-semibold text-ink-500">{t.inCurrency.replace("{currency}", commercial.currency)}</dt>
            <dd className="font-bold text-brand-900"><bdi dir="ltr">{quoted(commercial.displayTotal)}</bdi></dd>
            <dd className="text-[0.8125rem] text-ink-500">{rate == null ? t.rateLater : t.rateFixed.replace("{rate}", rate).replace("{currency}", commercial.currency)}</dd>
          </div>
        )}
      </dl>
      <button type="button" className="btn-primary mt-4" disabled={busy} onClick={onApprove}>{approveLabel}</button>
    </div>
  );
}

const copy = {
  en: {
    intro: "Check the prices and the margin, then approve.",
    introManualOne: "1 line is priced by the Consultant outside their approved list — check its price before you approve.",
    introManual: "{count} lines are priced by the Consultant outside their approved list — check their prices before you approve.",
    caption: "Proposal lines with the Consultant's base price and the patient's price",
    service: "Service", source: "Price source", base: "Consultant price (EGP)", patient: "Patient price (EGP)", inCurrency: "In {currency}",
    manual: "Manual — needs your approval", catalogue: "Approved list", facilityPackage: "Approved facility package",
    baseTotal: "Consultant price total", margin: "Platform margin", patientTotal: "Patient total (EGP)",
    policy: "Policy: {name} (version {version})", noPolicy: "No margin policy applies to this care area — no margin is added.",
    rateLater: "At today's rate; the rate is fixed when the proposal is sent to the patient.",
    rateFixed: "Rate fixed at release: 1 EGP = {rate} {currency}.",
  },
  ar: {
    intro: "راجع الأسعار والهامش، ثم وافق.",
    introManualOne: "بند واحد سعّره الاستشاري خارج قائمته المعتمدة — راجع سعره قبل الموافقة.",
    introManual: "بنود سعّرها الاستشاري خارج قائمته المعتمدة ({count}) — راجع أسعارها قبل الموافقة.",
    caption: "بنود العرض بسعر الاستشاري وسعر المريض",
    service: "الخدمة", source: "مصدر السعر", base: "سعر الاستشاري (ج.م)", patient: "سعر المريض (ج.م)", inCurrency: "بعملة {currency}",
    manual: "يدوي — يحتاج موافقتك", catalogue: "القائمة المعتمدة", facilityPackage: "باقة منشأة معتمدة",
    baseTotal: "إجمالي سعر الاستشاري", margin: "هامش المنصة", patientTotal: "إجمالي المريض (ج.م)",
    policy: "السياسة: {name} (الإصدار {version})", noPolicy: "لا تنطبق سياسة هامش على مجال الرعاية هذا — لا يُضاف هامش.",
    rateLater: "بسعر صرف اليوم؛ ويُثبَّت السعر عند إرسال العرض إلى المريض.",
    rateFixed: "سعر الصرف المثبَّت عند الإرسال: 1 ج.م = {rate} {currency}.",
  },
} as const;

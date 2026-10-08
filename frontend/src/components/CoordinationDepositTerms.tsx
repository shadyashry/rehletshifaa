import type { Locale } from "@/lib/i18n";
import { ARABIC_PENDING_NOTICE, depositTerms, exchangeRateFixedShort, isForeignCurrency } from "@/lib/commercial-terms";

/**
 * The short-form coordination deposit, refund and cancellation terms, shown inline wherever the patient is asked
 * to continue on the strength of them (before acknowledging an estimate, and beside the activation consent).
 * The wording is the approved English; Arabic pages show it as English with a notice until the Arabic review.
 */
export function CoordinationDepositTerms({ id, locale, amount, currency, level = 2, framed = true }: {
  id: string; locale: Locale; amount?: string | null; currency?: string | null; level?: 2 | 3;
  /** False inside a surface that already frames it (the portal drawer's disclosure): no second box. */
  framed?: boolean;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={`${id}-title`} id={id} className={framed ? "rounded-lg border border-line bg-white p-4 sm:p-5" : undefined}>
      {locale === "ar" && <p lang="ar" dir="rtl" className="mb-3 text-[0.875rem] leading-6 text-ink-700">{ARABIC_PENDING_NOTICE}</p>}
      <div lang="en" dir="ltr" className="text-start">
        <Heading id={`${id}-title`} className="text-[0.95rem] font-bold text-brand-900">{depositTerms.title}</Heading>
        {amount && (
          <p className="mt-2 text-[0.92rem] text-ink-800">{depositTerms.amountLabel}: <strong className="tabular-nums text-ink-900">{amount}</strong></p>
        )}
        <p className="mt-2 text-[0.88rem] leading-6 text-ink-700">{depositTerms.description}</p>
        <p className="mt-3 text-[0.85rem] font-bold text-ink-800">{depositTerms.refundsTitle}</p>
        <ul className="mt-1 list-disc space-y-1 ps-5 text-[0.88rem] leading-6 text-ink-700">
          {depositTerms.refunds.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
        <p className="mt-3 text-[0.85rem] font-bold text-ink-800">{depositTerms.cancellationTitle}</p>
        <p className="mt-1 text-[0.88rem] leading-6 text-ink-700">{depositTerms.cancellation}</p>
        <p className="mt-3 text-[0.85rem] font-bold text-ink-800">{depositTerms.paymentTitle}</p>
        <p className="mt-1 text-[0.88rem] leading-6 text-ink-700">{depositTerms.payment}</p>
        {isForeignCurrency(currency) && <p className="mt-3 text-[0.82rem] leading-5 text-ink-600">{exchangeRateFixedShort}</p>}
      </div>
    </section>
  );
}

/**
 * Patient-facing commercial wording approved for implementation in the pre-8C commercial copy decisions
 * (docs/platform-control-plane/pre-8c-commercial-copy-decisions.md, 2026-09-25).
 *
 * English only, on purpose. The native Arabic review has not returned, so these terms are not translated here:
 * Arabic pages show this English text inside a lang="en" region with `ARABIC_PENDING_NOTICE`, instead of
 * machine-written Arabic legal wording.
 *
 * Still open and deliberately absent from this file: legal enforceability of the refund rules (F2), refund
 * processing time, provider cancellation charges, final-quote validity, emergency-treatment costs, taxes,
 * which currency is legally payable, bank/payment-provider fees, and RehletShifaa's role (principal vs agent).
 */

/** Recorded with the deposit-terms consent and on new deposit components (backend PaymentService.DEPOSIT_TERMS_VERSION). */
export const DEPOSIT_TERMS_VERSION = "deposit-terms-2026-09-25";

export const ARABIC_PENDING_NOTICE = "تُعرض هذه الشروط بالإنجليزية إلى حين اعتماد صياغتها العربية.";

export const depositTerms = {
  title: "Coordination deposit, refunds and cancellation",
  amountLabel: "Coordination deposit",
  description:
    "You pay this deposit after you acknowledge your preliminary estimate, before we make any appointments or bookings for you. It covers starting your care coordination: contacting providers, scheduling your assessment and arranging your care. The full deposit is deducted from the price in your final treatment plan and quote.",
  refundsTitle: "Refunds of your coordination deposit",
  refunds: [
    "Full refund if you cancel before we confirm any appointment or booking for you.",
    "Full refund if we cannot arrange your care, the provider does not accept your case, or the treating doctor decides the treatment is not suitable for you.",
    "No refund if you cancel, or do not attend, after we have confirmed an appointment or booking for you.",
    "If you change provider, your deposit stays with your case and is still deducted from your final price.",
  ],
  cancellationTitle: "Cancellation",
  cancellation: "You can cancel at any time by telling your coordinator. Whether your deposit is refunded depends on the terms above.",
  paymentTitle: "How to pay",
  payment: "Your coordinator sends you the payment instructions. We start coordinating your care once your deposit is received. We never take card details on this website.",
} as const;

/** The checkbox wording approved for activation; the backend records exactly this text (PatientActivationService). */
export const DEPOSIT_TERMS_CONSENT = "I have read the coordination deposit, refund and cancellation terms shown above and accept them.";

export const estimateTerms = {
  nonBinding: "This is a preliminary, non-binding estimate, not a final price or a price guarantee.",
  mayChange: "Your treatment and its price may increase or decrease after your treating doctor examines you in person.",
  basisTitle: "What this estimate is based on",
  basis: [
    "A remote review of the medical information you provided",
    "Your consultant's recommended services and their current prices",
    "The assumptions listed in this estimate",
  ],
  basisRate: "RehletShifaa's stored exchange rate on the date it was issued",
  finalQuoteFollows: "You will receive a final treatment plan and quote to accept or decline before any non-emergency treatment.",
  coordinationIncluded: "RehletShifaa's care coordination is included in this price.",
  notIncludedTitle: "Not included unless listed",
  notIncluded: ["Flights", "Visas", "Accommodation", "Local transport", "Companion costs", "Additional tests or procedures", "Treatment of complications"],
} as const;

export const finalQuoteTerms = {
  basis: "Prepared after your in-person assessment. It covers the confirmed services listed, at the price shown.",
  changes: "Changes to the confirmed services need a revised quote, which you will be asked to accept.",
  notMedicalConsent: "Accepting this quote is not medical consent. Your treating doctor will ask for separate informed consent before treatment.",
  paymentTitle: "Payment",
  payment: "The remaining balance is due before treatment begins, unless this quote states otherwise. Your coordinator sends you the payment instructions. We never take card details on this website.",
} as const;

/** General safety statements, shown once on the proposal document rather than on every screen. */
export const generalDisclaimers = "No medical outcome is guaranteed. This service is not for emergencies. In an emergency, contact local emergency services.";

/**
 * What a new proposal version records as its payment terms: the approved product facts only. Refund terms are
 * not written on proposals while their legal status is open, and nothing here claims the balance gates treatment.
 */
export const PROPOSAL_PAYMENT_TERMS_RECORD =
  "Coordination deposit: due after the patient acknowledges the preliminary estimate; coordination begins once it is received. " +
  "Remaining balance: as set out in the final treatment plan and quote, before treatment unless that quote states otherwise. " +
  "Payment: offline, using payment instructions provided by the coordinator; card details are not taken on the platform.";

/** Placeholder text older proposal versions stored; kept in the record, never presented to a patient. */
export const LEGACY_PLACEHOLDER_TERMS: readonly string[] = [
  "Services not explicitly included", "Payment schedule to be confirmed", "Subject to provider terms",
];

export type CommercialDocument = "estimate" | "quote";

/** The short form, for places that show an amount already fixed by a proposal (activation, deposit). */
export const exchangeRateFixedShort = "The exchange rate used in your proposal is fixed for that proposal.";

/**
 * The complete exchange-rate statement. `dateLabel` is the day of the rate frozen on the document at release;
 * legacy documents without it get the same meaning without a date. Never "live", "real-time" or "official".
 */
export function exchangeRateStatement(currency: string, document: CommercialDocument, dateLabel?: string | null): string {
  const rate = dateLabel ? `RehletShifaa's exchange rate for ${dateLabel}` : `RehletShifaa's exchange rate on the date this ${document} was issued`;
  return `Amounts in ${currency} are converted using ${rate}. This rate is fixed for this ${document} while it is valid. A new estimate or quote may use a different rate.`;
}

export function isForeignCurrency(currency?: string | null): boolean {
  return !!currency && currency !== "EGP";
}

import { intlLocale, type Locale } from "@/lib/i18n";

/**
 * The one money format for every page: whole amounts without decimals, any other amount at the currency's own precision
 * (2 for USD, 3 for KWD, 0 for JPY), so the same total never reads "4,850" in one place and "4,850.00" in another.
 * Amounts are computed and rounded by the backend; this only formats them. Wrap the result in `<bdi dir="ltr">` (DESIGN.md) so the
 * figure keeps its order without turning the whole line, or its alignment, left-to-right in Arabic.
 */
export function formatMoney(amount: number, currency: string, locale: Locale) {
  const tag = intlLocale(locale);
  try {
    const digits = new Intl.NumberFormat(tag, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const fraction = Number.isInteger(amount) ? 0 : digits;
    return new Intl.NumberFormat(tag, { style: "currency", currency, minimumFractionDigits: fraction, maximumFractionDigits: digits }).format(amount);
  } catch {
    return `${amount.toLocaleString(tag)} ${currency}`;
  }
}

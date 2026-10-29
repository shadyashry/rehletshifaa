export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function alternateLocale(locale: Locale): Locale {
  return locale === "en" ? "ar" : "en";
}

/** The locale for `Intl` formatting. Arabic pins Western digits (owner default until the native Arabic review). */
export function intlLocale(locale: string): string {
  return locale === "ar" ? "ar-u-nu-latn" : locale;
}

/** A count in running text, through `intlLocale` so it follows the digit decision (backlog 373); never `String(n)`. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value);
}

/**
 * Arabic-Indic and Persian digits as Latin ones (DESIGN.md, "Numerals and isolation"). An Arabic phone keypad types ٠–٩,
 * so every field that takes digits runs its input through this before it filters, instead of silently dropping them.
 */
export function latinDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
}

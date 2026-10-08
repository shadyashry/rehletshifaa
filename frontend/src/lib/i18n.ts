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

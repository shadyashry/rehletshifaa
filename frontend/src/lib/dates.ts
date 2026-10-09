import { intlLocale, type Locale } from "@/lib/i18n";

/**
 * A calendar date with no time of day (a date of birth, "2000-01-01"), in long form. JavaScript reads such a value as
 * UTC midnight, so it is formatted in UTC too: in the viewer's own zone it would read as the previous day west of UTC.
 */
export function formatCalendarDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

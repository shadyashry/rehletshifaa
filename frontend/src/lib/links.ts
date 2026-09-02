import type { Dictionary } from "./dictionary";
import type { Locale } from "./i18n";

export type NavItem = { readonly href: string; readonly label: string };

const WHATSAPP_FALLBACK = "201010447898";

/** Locale-prefixed internal href. `localeHref("en")` → `/en`. */
export function localeHref(locale: Locale, path = ""): string {
  const clean = path.replace(/^\/+/, "");
  return clean ? `/${locale}/${clean}` : `/${locale}`;
}

/** Swap the locale segment of the current pathname, preserving the route. */
export function swapLocale(pathname: string, next: Locale): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return `/${next}`;
  segments[0] = next;
  return `/${segments.join("/")}`;
}

export function primaryNav(locale: Locale, d: Dictionary): readonly NavItem[] {
  return [
    { href: localeHref(locale), label: d.nav.home },
    { href: localeHref(locale, "care-areas"), label: d.nav.careAreas },
    { href: localeHref(locale, "how-it-works"), label: d.nav.how },
    { href: localeHref(locale, "consultants"), label: d.nav.consultants },
    { href: localeHref(locale, "portal"), label: d.nav.portal },
  ];
}

export function legalNav(locale: Locale, d: Dictionary): readonly NavItem[] {
  return [
    { href: localeHref(locale, "privacy"), label: d.common.privacy },
    { href: localeHref(locale, "terms"), label: d.common.terms },
    { href: localeHref(locale, "medical-disclaimer"), label: d.common.disclaimer },
  ];
}

export function whatsappHref(message?: string): string {
  const configured = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? WHATSAPP_FALLBACK;
  const number = configured.replace(/\D/g, "") || WHATSAPP_FALLBACK;
  return message ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : `https://wa.me/${number}`;
}

export const WHATSAPP_INTRO = "Hello RehletShifaa, I would like help reviewing a medical case.";

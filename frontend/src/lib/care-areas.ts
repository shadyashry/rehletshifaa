import { additionalCareAreas } from "./additional-care-areas";
import type { Dictionary } from "./dictionary";
import type { Locale } from "./i18n";
import { localeHref, type NavItem } from "./links";

/** Original home-page feature order; additional areas share the public catalogue and tab navigation. */
export const CARE_AREA_SLUGS = ["cardiology", "rheumatology-rehabilitation", "orthopedics"] as const;

export type CareAreaSlug = (typeof CARE_AREA_SLUGS)[number];

/** Dictionary key (under `careAreasPage.tabs` / `form.category.options`) per slug. */
export const CARE_AREA_KEY: Record<CareAreaSlug, "cardiology" | "rheumatology" | "orthopedics"> = {
  cardiology: "cardiology",
  "rheumatology-rehabilitation": "rheumatology",
  orthopedics: "orthopedics",
};

/** Tab items for the category tab strip, in canonical order. */
export function careAreaTabs(locale: Locale, d: Dictionary): readonly NavItem[] {
  return [...CARE_AREA_SLUGS.map((slug) => ({
    href: localeHref(locale, slug),
    label: d.careAreasPage.tabs[CARE_AREA_KEY[slug]],
  })), ...additionalCareAreas(locale).map(area => ({ href: localeHref(locale, area.slug), label: area.title }))];
}

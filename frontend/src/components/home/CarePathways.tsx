import { ArrowRight } from "lucide-react";

import { TrackedLink } from "@/components/TrackedLink";
import { careAreaAtlas, careAtlasSystems, type CareAreaIconName, type CareSystem } from "@/lib/care-area-catalog";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { CareSystemsGrid, type GridSystem } from "./CareSystemsGrid";

/** Each body system's mark on its card. */
const SYSTEM_ICON: Record<CareSystem, CareAreaIconName> = {
  heart: "heart",
  neuro: "brain",
  movement: "bone",
  digestive: "digestive",
  surgery: "surgery",
  women: "women",
};

/**
 * The care areas on the homepage — a preview of the Care Areas page: the six body systems, all visible, each with its
 * care areas and the named Consultants who lead it. Every area keeps equal standing (no featured specialty); the same
 * systems, tones and icons as the Care Areas page, so the two read as one system.
 */
export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  const ar = locale === "ar";
  const areas = careAreaAtlas(locale, d);
  // "Dr A and Dr B", "Dr A, Dr B and 2 more".
  const ledBy = (names: readonly string[]) => {
    const shown = names.slice(0, 2);
    const rest = names.length - shown.length;
    if (ar) return rest > 0 ? `${shown.join("، ")} و ${rest} آخرين` : shown.join(" و");
    return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(" and ");
  };

  const systems: GridSystem[] = careAtlasSystems(areas, d).map((system) => {
    const people = system.areas.flatMap((area) => area.consultants);
    return {
      key: system.key,
      icon: SYSTEM_ICON[system.key],
      title: system.title,
      body: system.body,
      areas: system.areas.map((area) => ({ slug: area.slug, href: localeHref(locale, area.slug), title: area.title })),
      people: people.map((profile) => ({ slug: profile.slug, initials: profile.initials, ...(profile.portrait ? { portrait: profile.portrait } : {}) })),
      ledBy: ledBy(people.map((profile) => profile.name)),
    };
  });

  return (
    <section aria-labelledby="home-areas-title" className="bg-surface-pearl pb-[clamp(2.75rem,2rem+2.2vw,4.5rem)] pt-[clamp(2rem,1.5rem+1.8vw,3.25rem)]">
      <div className="container-site">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-16">
          <div>
            <p className="eyebrow">{d.home.areasEyebrow}</p>
            <h2 id="home-areas-title" className="headline mt-2 [text-wrap:balance]">{d.home.areasTitle.replace("{count}", String(areas.length))}</h2>
            <p className="mt-3 max-w-[56ch] text-[1rem] leading-7 text-ink-600">{d.home.areasIntro}</p>
          </div>
          <TrackedLink event="send_case_cta_clicked" className="link-cta text-[0.9375rem] lg:justify-self-end" href={localeHref(locale, "care-areas")}>
            {d.common.explore}
            <ArrowRight size={15} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </div>

        <CareSystemsGrid systems={systems} ledByLabel={ar ? "بقيادة" : "Led by"} />
      </div>
    </section>
  );
}

import { ArrowRight } from "lucide-react";

import { TrackedLink } from "@/components/TrackedLink";
import { careAreaAtlas, careAtlasSystems } from "@/lib/care-area-catalog";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { CareSelector, type SelectorSystem } from "./CareSelector";

const SHOWN_MONOGRAMS = 4;

/**
 * The care areas on the homepage — a preview of the Care Areas page, built as a selector rather than an index: the
 * six body systems as one numbered list, and the chosen system's care areas, Consultants and scope beside it. Every
 * area keeps equal standing (no featured specialty); the same systems, tones and icons as the Care Areas page and the
 * Consultants panel, so the three read as one system.
 */
export function CarePathways({ locale, d }: { locale: Locale; d: Dictionary }) {
  const ar = locale === "ar";
  const areas = careAreaAtlas(locale, d);
  const consultants = (n: number) =>
    n === 1 ? d.home.areasConsultantsOne : n === 2 ? d.home.areasConsultantsTwo : d.home.areasConsultantsMany.replace("{n}", String(n));
  // "Dr A and Dr B", "Dr A, Dr B and 2 more" — names build trust where initials alone cannot.
  const names = (list: readonly string[]) => {
    const shown = list.slice(0, 2);
    const rest = list.length - shown.length;
    if (ar) return rest > 0 ? `${shown.join("، ")} و${rest} آخرون` : shown.join(" و");
    return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(" and ");
  };
  const areaCount = (n: number) =>
    ar ? (n === 1 ? "مجال رعاية واحد" : n === 2 ? "مجالا رعاية" : `${n} مجالات رعاية`) : n === 1 ? "1 care area" : `${n} care areas`;

  const systems: SelectorSystem[] = careAtlasSystems(areas, d).map((system) => {
    const people = system.areas.flatMap((area) => area.consultants);
    return {
      key: system.key,
      title: system.title,
      body: system.body,
      meta: `${areaCount(system.areas.length)} · ${consultants(people.length)}`,
      monograms: people.slice(0, SHOWN_MONOGRAMS).map((profile) => profile.initials),
      more: Math.max(0, people.length - SHOWN_MONOGRAMS),
      consultants: consultants(people.length),
      names: names(people.map((profile) => profile.name)),
      areas: system.areas.map((area) => ({
        slug: area.slug,
        href: localeHref(locale, area.slug),
        title: area.title,
        // What the area actually covers (its focus areas) says more than a short restatement of its name.
        short: area.facets.length > 0 ? area.facets.slice(0, 3).join(" · ") : area.short,
        facets: area.facets,
        icon: area.icon,
        consultants: area.consultants.length > 0 ? consultants(area.consultants.length) : "",
        people: area.consultants.slice(0, 3).map((profile) => profile.initials),
      })),
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

        <CareSelector
          systems={systems}
          copy={{
            listLabel: ar ? "أجهزة الجسم" : "Body systems",
            ledBy: ar ? "بقيادة" : "Led by",
            unsure: ar ? "لست متأكدًا أيّها يناسبك؟" : "Not sure which one fits?",
            unsureAction: ar ? "أرسل حالتك، وسيوجّهها منسّقك إلى الاستشاري المناسب." : "Send your case — your coordinator routes it to the right Consultant.",
            sendHref: localeHref(locale, "send-my-case"),
            nextTitle: ar ? "هل حالتك ضمن «{system}»؟" : "Is your case about {system}?",
            nextBody: ar ? "أرسلها كما هي، ويؤكّد منسّقك الاستشاري المناسب قبل أي قرار." : "Send it as it is — your coordinator confirms the right Consultant before anything is decided.",
            nextAction: d.home.primaryAction,
          }}
        />
      </div>
    </section>
  );
}

import { BedDouble, Plane, PlaneLanding, Stamp } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import { SectionHeader } from "@/components/SectionHeader";

const ICONS = [Plane, BedDouble, Stamp, PlaneLanding] as const;

/**
 * Optional travel & stay support — flights, hotel, visa assistance and airport
 * reception — arranged only after the medical proposal. Presented as clearly
 * optional so treatment, not travel, stays the centre of the offer.
 */
export function TravelServices({ d }: { d: Dictionary }) {
  const t = d.home.travel;
  return (
    <section className="section">
      <div className="container-site">
        <SectionHeader eyebrow={t.eyebrow} title={t.title} intro={t.intro} />

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.items.map((item, index) => {
            const Icon = ICONS[index] ?? Plane;
            return (
              <li key={item.title} className="card flex flex-col p-6">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <h3 className="title mt-5 text-[1.05rem]">{item.title}</h3>
                <p className="mt-2 text-[0.9rem] leading-6 text-ink-600">{item.body}</p>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 rounded-2xl border border-line bg-mist p-5 text-sm leading-6 text-ink-600">
          {t.note}
        </p>
      </div>
    </section>
  );
}

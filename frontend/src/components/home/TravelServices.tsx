import { BedDouble, PackageCheck, Plane, PlaneLanding, Stamp } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import { SectionHeader } from "@/components/SectionHeader";

const ICONS = [Plane, BedDouble, Stamp, PlaneLanding] as const;

/**
 * Optional but professionally run travel & stay: our own travel professionals
 * handle the whole journey — flight to airport reception — as a single package
 * shaped around each patient's needs, arranged only after the medical proposal.
 */
export function TravelServices({ d }: { d: Dictionary }) {
  const t = d.home.travel;
  return (
    <section className="section">
      <div className="container-site">
        <SectionHeader eyebrow={t.eyebrow} title={t.title} intro={t.intro} />

        <div className="mt-10 overflow-hidden rounded-3xl border border-brand-200 bg-brand-50">
          <div className="flex items-center gap-3 border-b border-brand-200 bg-brand-100 px-6 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700">
              <PackageCheck size={20} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <p className="text-[0.95rem] font-bold text-brand-900">{t.packageLabel}</p>
          </div>

          <ul className="grid gap-px bg-brand-200 sm:grid-cols-2 lg:grid-cols-4">
            {t.items.map((item, index) => {
              const Icon = ICONS[index] ?? Plane;
              return (
                <li key={item.title} className="flex flex-col bg-brand-50 p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-white text-brand-700">
                    <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <h3 className="title mt-5 text-[1.05rem]">{item.title}</h3>
                  <p className="mt-2 text-[0.9rem] leading-6 text-ink-600">{item.body}</p>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-6 rounded-2xl border border-line bg-mist p-5 text-sm leading-6 text-ink-600">
          {t.note}
        </p>
      </div>
    </section>
  );
}

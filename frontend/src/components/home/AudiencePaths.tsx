import { ArrowRight, ClipboardList, Check, UserRound } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { SectionHeader } from "@/components/SectionHeader";
import { TrackedLink } from "@/components/TrackedLink";

type PathCardProps = {
  icon: typeof UserRound;
  title: string;
  body: string;
  items: readonly string[];
  action: React.ReactNode;
};

function PathCard({ icon: Icon, title, body, items, action }: PathCardProps) {
  return (
    <article className="card flex flex-col p-7 sm:p-9">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-700">
        <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em] text-brand-900 rtl:tracking-normal">
        {title}
      </h3>
      <p className="mt-3 leading-7 text-ink-500">{body}</p>
      <ul className="mt-6 grid gap-3 border-t border-line pt-6">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[0.95rem] leading-6 text-ink-700">
            <Check size={17} className="mt-0.5 text-accent-700" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-7">{action}</div>
    </article>
  );
}

export function AudiencePaths({ locale, d }: { locale: Locale; d: Dictionary }) {
  return (
    <section className="section section-soft">
      <div className="container-site">
        <SectionHeader eyebrow={d.home.pathsEyebrow} title={d.home.pathsTitle} />

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <PathCard
            icon={UserRound}
            title={d.home.patientTitle}
            body={d.home.patientBody}
            items={d.home.patientItems}
            action={
              <TrackedLink
                event="send_case_cta_clicked"
                className="btn-primary w-full sm:w-auto"
                href={localeHref(locale, "send-my-case")}
              >
                {d.common.send}
                <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
              </TrackedLink>
            }
          />
          <PathCard
            icon={ClipboardList}
            title={d.home.doctorTitle}
            body={d.home.doctorBody}
            items={d.home.doctorItems}
            action={
              <TrackedLink
                event="whatsapp_clicked"
                target="_blank"
                className="btn-secondary w-full sm:w-auto"
                href={whatsappHref(WHATSAPP_INTRO)}
              >
                {d.common.whatsapp}
              </TrackedLink>
            }
          />
        </div>
      </div>
    </section>
  );
}

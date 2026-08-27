import { ArrowRight, FileText, UserCheck } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import { whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * The service promise behind the process: a named coordinator, and clarity on
 * the proposed pathway before any travel decision is taken.
 */
export function SupportBand({ d }: { d: Dictionary }) {
  return (
    <section className="section">
      <div className="container-site grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
        <article className="bg-white p-7 sm:p-10">
          <UserCheck size={24} strokeWidth={1.8} className="text-accent-700" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.015em] text-brand-900 rtl:tracking-normal">
            {d.home.coordinatorTitle}
          </h2>
          <p className="mt-4 leading-7 text-ink-500">{d.home.coordinatorBody}</p>
          <TrackedLink
            event="whatsapp_clicked"
            className="link-cta mt-6"
            target="_blank"
            href={whatsappHref(WHATSAPP_INTRO)}
          >
            {d.common.whatsapp}
            <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
          </TrackedLink>
        </article>

        <article className="bg-mist p-7 sm:p-10">
          <FileText size={24} strokeWidth={1.8} className="text-accent-700" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.015em] text-brand-900 rtl:tracking-normal">
            {d.home.beforeTitle}
          </h2>
          <p className="mt-4 leading-7 text-ink-500">{d.home.beforeBody}</p>
        </article>
      </div>
    </section>
  );
}

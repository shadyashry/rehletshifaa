import { MessageCircle } from "lucide-react";

import { TrackedLink } from "@/components/TrackedLink";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { whatsappEntry } from "@/lib/links";

/**
 * What happens after the form is sent, beside the form while it is filled in: four steps on one hairline, each a
 * thing the platform actually produces (a case number and link, a named coordinator, a Consultant's review, an
 * estimate), and the WhatsApp route for someone who would rather talk first. Marks, not numbers: the order is the
 * line's, and nothing here is a counter.
 */
export function NextStepsAside({ locale, d }: { locale: Locale; d: Dictionary }) {
  const t = d.form.nextSteps;
  return (
    <aside className="card p-6 lg:sticky lg:top-6" aria-labelledby="next-steps-title">
      <h2 id="next-steps-title" className="text-[1.0625rem] font-semibold leading-6 text-brand-900">{t.title}</h2>
      <ol className="relative mt-4 ps-5">
        <span aria-hidden className="absolute bottom-3 start-[0.3125rem] top-2 w-px bg-brand-300" />
        {t.items.map(([title, body]) => (
          <li key={title} className="relative pb-4 last:pb-0">
            <span aria-hidden className="absolute -start-5 top-[0.4375rem] h-[0.6875rem] w-[0.6875rem] rounded-full border-2 border-brand-600 bg-surface-elevated" />
            <p className="text-[0.9375rem] font-semibold leading-6 text-ink-900">{title}</p>
            <p className="text-[0.875rem] leading-6 text-ink-600">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 border-t border-line pt-5">
        <p className="text-[0.875rem] leading-6 text-ink-600">{t.whatsapp}</p>
        <TrackedLink event="whatsapp_clicked" className="btn-secondary mt-3 w-full" target="_blank" href={whatsappEntry(locale)}>
          <MessageCircle size={17} aria-hidden="true" />
          {d.common.whatsapp}
        </TrackedLink>
      </div>
    </aside>
  );
}

import { Check, EyeOff, FileLock2, Siren, Stethoscope, UserCheck, UserRound, UserRoundCog, UserRoundSearch } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";

const ICONS = [Stethoscope, FileLock2, UserCheck, Siren] as const;
const PEOPLE_ICONS = [UserRound, UserRoundCog, UserRoundSearch] as const;

/**
 * Privacy and clinical governance. The narrow column carries the heading, one line and the section's one
 * visual — "who works with your case": the case in private storage, the three people who work with it
 * (you, your coordinator, your Consultant) on the care-journey line, and the one thing it never is: public.
 * The wide column sets the four commitments as quiet cards (unnumbered: they are rules, not steps). Every statement describes behaviour
 * the platform actually implements; no certifications, statistics or endorsements are claimed, and the
 * diagram names who works with a case without claiming that nobody else in operations can.
 */
export function TrustSection({ d }: { d: Dictionary }) {
  const access = d.home.trustAccess;

  return (
    <section aria-labelledby="trust-title" className="bg-surface-pearl py-[clamp(2.75rem,2rem+2.2vw,4.5rem)]">
      <div className="container-site grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
        <div>
          <p className="eyebrow">{d.home.trustEyebrow}</p>
          <h2 id="trust-title" className="headline mt-2 max-w-[16ch] rtl:max-w-[24ch] [text-wrap:balance]">{d.home.trustTitle}</h2>
          <p className="mt-3 max-w-[40ch] text-[1.0625rem] leading-7 text-ink-600 sm:mt-4">{d.home.trustIntro}</p>

          <figure className="mt-7 rounded-[18px] border border-border-card bg-surface-default p-5 shadow-[0_24px_48px_-40px_rgba(36,64,74,0.5)] sm:p-6">
            <figcaption className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-ink-500 rtl:text-[0.8125rem] rtl:normal-case rtl:tracking-normal">{access.title}</figcaption>

            <div className="mt-4 flex items-center gap-3.5 rounded-[14px] bg-brand-700 px-4 py-3.5 text-white">
              <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/12 ring-1 ring-white/25">
                <FileLock2 size={19} strokeWidth={1.7} />
              </span>
              <div className="min-w-0">
                <p className="text-[1rem] font-semibold leading-6">{access.case}</p>
                <p className="text-[0.8125rem] leading-5 text-white/80">{access.storage}</p>
              </div>
            </div>

            <ul className="relative mt-1 ps-[1.875rem]">
              <span aria-hidden className="absolute bottom-[1.6rem] start-[1.375rem] top-0 w-px bg-brand-300" />
              {access.people.map(([name, role], index) => {
                const Icon = PEOPLE_ICONS[index] ?? UserRound;
                return (
                  <li key={name} className="relative flex items-center gap-3 pt-3">
                    <span aria-hidden className="absolute -start-2 top-[2.1rem] h-px w-5 bg-brand-300" />
                    <span aria-hidden className="relative ms-3 grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-clinical text-brand-700 ring-1 ring-border-clinical">
                      <Icon size={16} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-semibold leading-5 text-brand-900">{name}</p>
                      <p className="hidden text-[0.8125rem] leading-5 text-ink-500 sm:block">{role}</p>
                    </div>
                    <Check size={16} strokeWidth={2.4} aria-hidden="true" className="flex-none text-brand-600" />
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-dashed border-border-card px-4 py-3">
              <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-surface-pearl text-ink-400 ring-1 ring-border-subtle">
                <EyeOff size={16} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-semibold leading-5 text-ink-700">{access.never}</p>
                <p className="text-[0.8125rem] leading-5 text-ink-500">{access.neverBody}</p>
              </div>
            </div>
          </figure>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {d.home.trust.map((item, index) => {
            const Icon = ICONS[index] ?? Stethoscope;
            const urgent = index === ICONS.length - 1;
            return (
              <li
                key={item.title}
                className="group relative flex gap-4 rounded-[16px] border border-border-card bg-surface-default p-5 shadow-[0_1px_2px_rgba(36,64,74,0.04)] transition-[border-color,box-shadow] duration-300 hover:border-brand-300 hover:shadow-[0_22px_44px_-30px_rgba(36,64,74,0.45)] sm:flex-col sm:gap-0 sm:p-7"
              >
                <div className="flex flex-none items-start justify-between gap-4">
                  <span
                    aria-hidden
                    className={`grid h-11 w-11 place-items-center sm:h-12 sm:w-12 rounded-2xl ring-1 ${urgent ? "bg-alert-50 text-alert-700 ring-alert-200" : "bg-surface-clinical text-brand-700 ring-border-clinical"}`}
                  >
                    <Icon size={21} strokeWidth={1.7} />
                  </span>
                </div>
                <div className="min-w-0 sm:mt-5">
                  <h3 className="text-[1.0625rem] font-semibold leading-snug text-brand-900 [text-wrap:balance] sm:text-[1.125rem]">{item.title}</h3>
                  <p className="mt-1 text-[0.9375rem] leading-6 text-ink-600 sm:mt-2 sm:text-[1rem] sm:leading-7">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

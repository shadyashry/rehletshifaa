import { ArrowRight, Check, Clock3, Languages, ShieldCheck, Stethoscope } from "lucide-react";
import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";

/**
 * The opening screen carries one claim, one action and one piece of evidence.
 *
 * <p>The evidence is the journey film — real project media rather than stock clinicians — so it anchors
 * the right column and the reassurance about what a patient needs to begin rides underneath it as a
 * single quiet line. That reassurance used to be a white card the size of the headline, which made the
 * page argue with itself about where to look.
 */
export function Hero({ locale, d }: { locale: Locale; d: Dictionary }) {
  const arabic = locale === "ar";
  const source = arabic ? "/media/rehletshifaa-journey-ar.mp4?v=5" : "/media/rehletshifaa-journey-en.mp4?v=3";
  const poster = arabic ? "/media/rehletshifaa-journey-ar-poster.jpg?v=2" : "/media/rehletshifaa-journey-en-poster.jpg?v=2";
  const videoLabel = arabic
    ? "رحلة المريض مع رحلة شفاء، من مشاركة التقارير الطبية إلى المتابعة المنظمة"
    : "RehletShifaa patient journey from sharing medical reports to coordinated follow-up";

  const trust = arabic
    ? [[Stethoscope, "مراجعة بقيادة استشاري"], [Clock3, "خطوات واضحة قبل السفر"], [Languages, "دعم عربي وإنجليزي"], [ShieldCheck, "تداول خاص للمستندات"]] as const
    : [[Stethoscope, "Consultant-led review"], [Clock3, "Clear steps before travel"], [Languages, "Arabic & English support"], [ShieldCheck, "Private document handling"]] as const;

  return (
    <section className="border-b border-line bg-white">
      <div className="container-site grid items-center gap-6 py-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:py-14">
        <div className="max-w-[34rem]">
          <p className="eyebrow">{d.home.eyebrow}</p>
          <h1 className="display mt-2 sm:mt-2.5 [text-wrap:balance]">{d.home.title}</h1>
          <p className="lead mt-3 sm:mt-4">{d.home.intro}</p>

          {/* On a phone the secondary action is a quiet link beside the button — one primary control, one row. */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-7">
            <TrackedLink event="send_case_cta_clicked" className="btn-primary" href={localeHref(locale, "send-my-case")}>
              {d.home.primaryAction}
              <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
            </TrackedLink>
            <Link className="link-cta text-[0.95rem] sm:hidden" href="#how-it-works">{d.home.watchJourney}</Link>
            <Link className="btn-secondary hidden sm:inline-flex" href="#how-it-works">{d.home.watchJourney}</Link>
          </div>

          <p className="mt-5 border-t border-line pt-4 text-[0.88rem] leading-6 text-ink-600 sm:mt-6 sm:pt-5 sm:text-[0.9rem]">
            <span className="font-semibold text-brand-800">{d.home.slogan}</span>{" "}
            {d.home.preliminaryNotice}
          </p>
        </div>

        <figure className="m-0">
          <div className="overflow-hidden rounded-[14px] border border-line bg-mist">
            <video className="block aspect-video w-full bg-mist" controls playsInline preload="metadata"
                   poster={poster} aria-label={videoLabel}>
              <source src={source} type="video/mp4" />
              {arabic ? "متصفحك لا يدعم تشغيل الفيديو." : "Your browser does not support embedded video."}
            </video>
          </div>

          {/* What a patient needs to begin: one line, three chips, no second headline. */}
          <figcaption className="mt-3 rounded-[12px] bg-mist px-3.5 py-3 sm:mt-4 sm:px-4 sm:py-3.5">
            <p className="text-[0.88rem] font-semibold text-brand-900">{d.home.heroCardTitle}</p>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {d.home.prepareItems.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-[0.875rem] leading-6 text-ink-600">
                  <Check size={14} strokeWidth={2.4} className="flex-none text-accent-700" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[0.875rem] leading-5 text-ink-500">{d.home.reassurance}</p>
          </figcaption>
        </figure>
      </div>

      <div className="border-t border-line bg-mist">
        <ul className="container-site grid grid-cols-2 gap-x-5 gap-y-2 py-3 lg:grid-cols-4 lg:py-3.5">
          {trust.map(([Icon, label]) => (
            <li key={label} className="flex items-center gap-2 text-[0.875rem] font-semibold leading-5 text-ink-700 sm:text-[0.82rem]">
              <Icon size={16} strokeWidth={1.9} className="flex-none text-brand-600" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

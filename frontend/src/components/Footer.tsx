import Link from "next/link";
import { ChevronDown, MessageCircle } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { legalNav, primaryNav, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";

/**
 * Desktop keeps the full four-column footer. On a phone the three link groups collapse into native
 * disclosures — one short row each — so the footer is a few lines rather than a second page, while
 * every legal link stays one tap away and the medical notice stays readable at 13px.
 */
export function Footer({ locale, d }: { locale: Locale; d: Dictionary }) {
  const explore = primaryNav(locale, d).slice(1, 4);
  const legal = legalNav(locale, d);
  const year = new Date().getFullYear();

  const groups: { title: string; items: React.ReactNode }[] = [
    {
      title: d.footer.explore,
      items: explore.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="footer-link">{item.label}</Link>
        </li>
      )),
    },
    {
      title: d.footer.legal,
      items: legal.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="footer-link">{item.label}</Link>
        </li>
      )),
    },
    {
      title: d.footer.contact,
      items: (
        <li>
          <TrackedLink event="whatsapp_clicked" target="_blank" href={whatsappHref(WHATSAPP_INTRO)} className="footer-link inline-flex items-center gap-2">
            <MessageCircle size={16} aria-hidden="true" />
            {d.common.whatsapp}
          </TrackedLink>
        </li>
      ),
    },
  ];

  return (
    <footer className="border-t border-border-subtle bg-surface-warm text-ink-600">
      <div className="container-site py-8 sm:grid sm:grid-cols-2 sm:gap-10 sm:py-12 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] lg:gap-10 lg:py-14">
        <div className="max-w-sm sm:col-span-2 lg:col-span-1">
          <Logo label={d.common.brand} accent={d.common.brandAccent} arabicLabel={d.common.brandArabic} arabicAccent={d.common.brandArabicAccent} size={44} />
          <p className="mt-3 max-w-[36ch] text-[0.95rem] leading-6 text-ink-600 sm:mt-4">{d.footer.description}</p>
        </div>

        {/* Phone: disclosures. */}
        <div className="mt-5 border-t border-sand-200 sm:hidden">
          {groups.map((group) => (
            <details key={group.title} className="group border-b border-sand-200">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 text-[0.9rem] font-semibold text-brand-900 [&::-webkit-details-marker]:hidden">
                {group.title}
                <ChevronDown size={18} aria-hidden="true" className="text-ink-400 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="grid gap-2.5 pb-4 text-[0.95rem]">{group.items}</ul>
            </details>
          ))}
        </div>

        {/* Tablet and desktop: columns. */}
        {groups.map((group) => (
          <div key={group.title} className="hidden sm:block">
            <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-brand-900 rtl:text-[0.85rem] rtl:normal-case rtl:tracking-normal">
              {group.title}
            </h2>
            <ul className="mt-4 grid gap-3 text-[0.95rem]">{group.items}</ul>
          </div>
        ))}
      </div>

      <div className="border-t border-sand-200">
        <div className="container-site flex flex-col gap-3 py-5 sm:gap-6 sm:py-6 md:flex-row md:items-start md:justify-between">
          <p className="max-w-[72ch] text-[0.875rem] leading-6 text-ink-600">{d.common.medicalNotice}</p>
          <p className="shrink-0 text-[0.875rem] text-ink-600">
            © {year} {d.common.brand}. {d.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}

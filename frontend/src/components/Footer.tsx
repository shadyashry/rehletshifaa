import Link from "next/link";
import { MessageCircle } from "lucide-react";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { legalNav, localeHref, primaryNav, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";

export function Footer({ locale, d }: { locale: Locale; d: Dictionary }) {
  const explore = [
    ...primaryNav(locale, d).slice(1),
    { href: localeHref(locale, "send-my-case"), label: d.nav.send },
  ];
  const legal = legalNav(locale, d);
  const year = new Date().getFullYear();

  return (
    <footer className="on-dark bg-brand-900 text-brand-100">
      <div className="container-site grid gap-10 py-14 sm:grid-cols-2 md:py-16 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
        <div className="max-w-sm sm:col-span-2 lg:col-span-1">
          <Logo label={d.common.brand} tone="light" />
          <p className="mt-4 text-sm leading-6 text-brand-200">{d.footer.description}</p>
        </div>

        <FooterColumn title={d.footer.explore}>
          {explore.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="footer-link">
                {item.label}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title={d.footer.legal}>
          {legal.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="footer-link">
                {item.label}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title={d.footer.contact}>
          <li>
            <TrackedLink
              event="whatsapp_clicked"
              target="_blank"
              href={whatsappHref(WHATSAPP_INTRO)}
              className="footer-link inline-flex items-center gap-2"
            >
              <MessageCircle size={16} aria-hidden="true" />
              {d.common.whatsapp}
            </TrackedLink>
          </li>
        </FooterColumn>
      </div>

      <div className="border-t border-white/10">
        <div className="container-site flex flex-col gap-5 py-8 md:flex-row md:items-start md:justify-between">
          <p className="max-w-3xl text-xs leading-6 text-brand-300">{d.common.medicalNotice}</p>
          <p className="shrink-0 text-xs text-brand-300">
            © {year} {d.common.brand}. {d.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-accent-200 rtl:tracking-normal rtl:normal-case rtl:text-[0.85rem]">
        {title}
      </h2>
      <ul className="mt-4 grid gap-2.5 text-sm">{children}</ul>
    </div>
  );
}

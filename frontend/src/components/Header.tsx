import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, primaryNav } from "@/lib/links";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";
import { LocaleSwitch } from "./nav/LocaleSwitch";
import { MobileNav } from "./nav/MobileNav";
import { PrimaryNav } from "./nav/PrimaryNav";

export function Header({ locale, d }: { locale: Locale; d: Dictionary }) {
  const items = primaryNav(locale, d);
  const navLabel = locale === "ar" ? "التنقل الرئيسي" : "Primary navigation";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="container-site flex min-h-[4.5rem] items-center justify-between gap-4">
        <Link href={localeHref(locale)} aria-label={`${d.common.brand} — ${d.nav.home}`}>
          <Logo
            label={d.common.brand}
            arabicLabel={locale === "ar" ? d.common.brandArabic : undefined}
            size={38}
          />
        </Link>

        <PrimaryNav items={items} label={navLabel} />

        <div className="hidden items-center gap-2 lg:flex">
          <LocaleSwitch locale={locale} label={d.nav.language} ariaLabel={d.nav.languageAria} />
          <TrackedLink
            event="send_case_cta_clicked"
            className="btn-primary"
            href={localeHref(locale, "send-my-case")}
          >
            {d.nav.send}
          </TrackedLink>
        </div>

        <MobileNav
          locale={locale}
          items={items}
          labels={{
            open: d.common.menu,
            close: d.common.menuClose,
            nav: navLabel,
            send: d.nav.send,
            language: d.nav.language,
            languageAria: d.nav.languageAria,
          }}
        />
      </div>
    </header>
  );
}

import Link from "next/link";

import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, primaryNav } from "@/lib/links";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";
import { HideOnPortal } from "./nav/HideOnPortal";
import { LocaleSwitch } from "./nav/LocaleSwitch";
import { MobileNav } from "./nav/MobileNav";
import { PrimaryNav } from "./nav/PrimaryNav";

export function Header({ locale, d }: { locale: Locale; d: Dictionary }) {
  const items = primaryNav(locale, d);
  const navLabel = locale === "ar" ? "التنقل الرئيسي" : "Primary navigation";

  return (
    <header className="sticky top-0 z-50 isolate border-b border-line bg-white/95 shadow-[0_8px_30px_-28px_rgba(28,51,58,.65)] backdrop-blur-xl">
      <div className="container-site flex min-h-[4.25rem] items-center justify-between gap-3 md:min-h-[4.5rem]">
        <Link href={localeHref(locale)} aria-label={`${d.common.brand} — ${d.nav.home}`}>
          <Logo
            label={d.common.brand}
            accent={d.common.brandAccent}
            arabicLabel={d.common.brandArabic}
            arabicAccent={d.common.brandArabicAccent}
            size={36}
          />
        </Link>

        <HideOnPortal locale={locale}>
          <PrimaryNav items={items} label={navLabel} />
        </HideOnPortal>

        <HideOnPortal locale={locale}><div className="hidden items-center gap-2 lg:flex">
          <LocaleSwitch locale={locale} label={d.nav.language} ariaLabel={d.nav.languageAria} />
          <HideOnPortal locale={locale}>
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-primary"
              href={localeHref(locale, "send-my-case")}
            >
              {d.nav.send}
            </TrackedLink>
          </HideOnPortal>
        </div></HideOnPortal>
        <div id="portal-account-slot" className="flex items-center gap-2" />

        <HideOnPortal locale={locale}>
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
        </HideOnPortal>
      </div>
    </header>
  );
}

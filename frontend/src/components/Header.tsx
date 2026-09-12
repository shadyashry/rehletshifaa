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
    <header className="site-header sticky top-0 z-50 isolate border-b border-border-subtle bg-surface-pearl/95 backdrop-blur-xl">
      <div className="container-site flex min-h-[4.25rem] items-center justify-between gap-3 md:min-h-[4.5rem]">
        <Link href={localeHref(locale)} aria-label={`${d.common.brand} — ${d.nav.home}`}>
          <Logo
            label={d.common.brand}
            accent={d.common.brandAccent}
            arabicLabel={d.common.brandArabic}
            arabicAccent={d.common.brandArabicAccent}
            size={34}
          />
        </Link>

        <HideOnPortal locale={locale}>
          <PrimaryNav items={items} label={navLabel} />
        </HideOnPortal>

        {/* Right group, in ascending weight: language (utility) · Sign in (secondary account action, outlined) ·
            Start my case (the one primary conversion). Distinct from "Check case status" in the main navigation. */}
        <HideOnPortal locale={locale}><div className="hidden items-center gap-2 nav:flex">
          <LocaleSwitch locale={locale} label={d.nav.language} ariaLabel={d.nav.languageAria} />
          <Link href={localeHref(locale, "portal") + "?signin=1"} title={d.nav.signInHint} className="btn-outline">
            {d.nav.signIn}
          </Link>
          <HideOnPortal locale={locale}>
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-primary whitespace-nowrap"
              href={localeHref(locale, "send-my-case")}
            >
              {d.nav.send}
            </TrackedLink>
          </HideOnPortal>
        </div></HideOnPortal>
        {/* Signed-in patient navigation (My Care · Documents · Messages) mounts here beside the account menu. */}
        <div id="portal-nav-slot" className="flex flex-1 items-center justify-center empty:hidden" />
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
              signIn: d.nav.signIn,
              signInHint: d.nav.signInHint,
              language: d.nav.language,
              languageAria: d.nav.languageAria,
            }}
          />
        </HideOnPortal>
      </div>
    </header>
  );
}

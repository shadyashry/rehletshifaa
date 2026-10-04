import { ClipboardCheck, MessageCircle } from "lucide-react";
import Link from "next/link";

import { careAreaAtlas, careAtlasSystems } from "@/lib/care-area-catalog";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, primaryNav, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";
import { CareAreasMenu, type MenuSystem } from "./nav/CareAreasMenu";
import { HideOnPortal } from "./nav/HideOnPortal";
import { LocaleSwitch } from "./nav/LocaleSwitch";
import { MobileNav } from "./nav/MobileNav";
import { PrimaryNav } from "./nav/PrimaryNav";

/**
 * The public header, in two tiers from the desktop breakpoint:
 * - a slim ink utility bar that scrolls away — who the service is for, and the services an existing or
 *   undecided patient reaches for (a coordinator on WhatsApp, the case-status check, the language);
 * - the sticky main bar — wordmark · Care Areas (atlas menu) · Consultants · How It Works · Sign in ·
 *   Start my case. Three destinations in reading order (what → who → how) and one primary action, so the
 *   bar never crowds at the 1100px switch. Home is the wordmark's job.
 * Below the breakpoint the compact menu carries every destination and both actions.
 */
export function Header({ locale, d }: { locale: Locale; d: Dictionary }) {
  const [careAreas, ...rest] = primaryNav(locale, d);
  const status = rest[rest.length - 1];
  const destinations = rest.slice(0, -1);
  const navLabel = locale === "ar" ? "التنقل الرئيسي" : "Primary navigation";

  const atlas = careAreaAtlas(locale, d);
  const systems: MenuSystem[] = careAtlasSystems(atlas, d).map((system) => ({
    key: system.key,
    title: system.title,
    areas: system.areas.map((area) => ({ slug: area.slug, title: area.title, icon: area.icon, href: localeHref(locale, area.slug) })),
  }));
  const careAreaHrefs = [careAreas.href, ...atlas.map((area) => localeHref(locale, area.slug))];
  const separator = <span aria-hidden className="h-3.5 w-px bg-white/20" />;

  return (
    <>
      <HideOnPortal locale={locale}>
        <div className="hidden bg-brand-950 text-white/80 nav:block">
          <div className="container-site flex h-9 items-center justify-between gap-6 text-[0.8125rem]">
            <p className="flex items-center gap-2.5 truncate">
              <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-brand-400" />
              {d.nav.utilityTagline}
            </p>
            <nav aria-label={d.nav.utilityLabel} className="flex flex-none items-center gap-3">
              <a href={whatsappHref(WHATSAPP_INTRO)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-white/10 hover:text-white">
                <MessageCircle size={14} strokeWidth={2} aria-hidden="true" />
                {d.common.whatsapp}
              </a>
              {separator}
              <Link href={status.href} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium transition-colors hover:bg-white/10 hover:text-white">
                <ClipboardCheck size={14} strokeWidth={2} aria-hidden="true" />
                {status.label}
              </Link>
              {separator}
              <LocaleSwitch locale={locale} label={d.nav.language} ariaLabel={d.nav.languageAria} tone="dark" className="px-2! py-1! text-[0.8125rem]!" />
            </nav>
          </div>
        </div>
      </HideOnPortal>

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
            <PrimaryNav
              items={destinations}
              label={navLabel}
              leading={
                <CareAreasMenu
                  systems={systems}
                  overviewHref={careAreas.href}
                  sendHref={localeHref(locale, "send-my-case")}
                  activeHrefs={careAreaHrefs}
                  labels={{ trigger: careAreas.label, ...d.nav.careAreasMenu, send: d.nav.send }}
                />
              }
            />
          </HideOnPortal>

          {/* Right group: Sign in (secondary account action, outlined) · Start my case (the one primary conversion). */}
          <HideOnPortal locale={locale}>
            <div className="hidden items-center gap-2.5 nav:flex">
              <Link href={localeHref(locale, "portal") + "?signin=1"} title={d.nav.signInHint} className="btn-outline">
                {d.nav.signIn}
              </Link>
              <TrackedLink event="send_case_cta_clicked" className="btn-primary whitespace-nowrap" href={localeHref(locale, "send-my-case")}>
                {d.nav.send}
              </TrackedLink>
            </div>
          </HideOnPortal>
          {/* Signed-in patient navigation (My Care · Documents · Messages) mounts here beside the account menu. */}
          <div id="portal-nav-slot" className="flex flex-1 items-center justify-center empty:hidden" />
          <div id="portal-account-slot" className="flex items-center gap-2" />

          <HideOnPortal locale={locale}>
            <MobileNav
              locale={locale}
              items={primaryNav(locale, d)}
              contact={{ label: d.common.whatsapp, href: whatsappHref(WHATSAPP_INTRO) }}
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
    </>
  );
}

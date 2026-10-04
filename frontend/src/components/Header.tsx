import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { careAreaAtlas, careAtlasSystems } from "@/lib/care-area-catalog";
import type { Dictionary } from "@/lib/dictionary";
import type { Locale } from "@/lib/i18n";
import { localeHref, primaryNav, whatsappHref, WHATSAPP_INTRO } from "@/lib/links";
import { Logo } from "./Logo";
import { TrackedLink } from "./TrackedLink";
import { AccountMenu } from "./nav/AccountMenu";
import { CareAreasMenu, type MenuSystem } from "./nav/CareAreasMenu";
import { HideOnPortal } from "./nav/HideOnPortal";
import { LocaleSwitch } from "./nav/LocaleSwitch";
import { MobileNav } from "./nav/MobileNav";
import { PrimaryNav } from "./nav/PrimaryNav";

/**
 * The public header. From the desktop breakpoint it is one floating glass bar, inset from the page edges
 * and held a few pixels below the top as you scroll:
 *   wordmark · [ Care Areas ▾ · Consultants · How It Works ] · coordinator · language · My case ▾ · Start my case
 * The destinations sit in one soft pill track (the current page lifted as a white pill); the utilities
 * collapse into compact controls — the coordinator chip (labelled from xl), the language switch, and
 * "My case", which groups the two existing-patient routes (Sign in, Check case status). "Start my case"
 * stays the one filled action. Below the breakpoint the full-width bar and compact menu carry everything.
 */
export function Header({ locale, d }: { locale: Locale; d: Dictionary }) {
  const [careAreas, ...rest] = primaryNav(locale, d);
  const status = rest[rest.length - 1];
  const destinations = rest.slice(0, -1);
  const navLabel = locale === "ar" ? "التنقل الرئيسي" : "Primary navigation";
  const whatsapp = whatsappHref(WHATSAPP_INTRO);

  const atlas = careAreaAtlas(locale, d);
  const systems: MenuSystem[] = careAtlasSystems(atlas, d).map((system) => ({
    key: system.key,
    title: system.title,
    areas: system.areas.map((area) => ({ slug: area.slug, title: area.title, icon: area.icon, href: localeHref(locale, area.slug) })),
  }));
  const careAreaHrefs = [careAreas.href, ...atlas.map((area) => localeHref(locale, area.slug))];

  return (
    <header className="site-header sticky top-0 z-50 isolate border-b border-border-subtle bg-surface-pearl/95 backdrop-blur-xl nav:top-3 nav:mt-3 nav:border-b-0 nav:bg-transparent nav:backdrop-blur-none">
      <div className="container-site flex min-h-[4.25rem] items-center justify-between gap-3 md:min-h-[4.5rem] nav:min-h-[4rem] nav:rounded-[22px] nav:bg-surface-default/[0.93] nav:px-3.5 nav:shadow-[0_18px_44px_-30px_rgba(28,51,58,0.45)] nav:ring-1 nav:ring-border-subtle nav:backdrop-blur-2xl nav:backdrop-saturate-150">
        <Link href={localeHref(locale)} aria-label={`${d.common.brand} — ${d.nav.home}`} className="nav:ps-1.5">
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

        {/* Right group, in ascending weight: coordinator · language · My case (outlined) · Start my case (the one primary action). */}
        <HideOnPortal locale={locale}>
          <div className="hidden items-center gap-1.5 nav:flex">
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={d.common.whatsapp}
              title={d.common.whatsapp}
              className="group inline-flex h-11 items-center gap-2 rounded-full px-1.5 text-[0.875rem] font-semibold text-brand-800 transition-colors hover:bg-brand-50 xl:pe-3.5"
            >
              <span aria-hidden className="relative grid h-8 w-8 place-items-center rounded-full bg-surface-clinical text-brand-700 ring-1 ring-border-clinical transition-colors group-hover:bg-surface-default">
                <MessageCircle size={16} strokeWidth={2} />
              </span>
              <span aria-hidden className="hidden xl:inline">{d.nav.coordinatorShort}</span>
            </a>
            <LocaleSwitch locale={locale} label={d.nav.language} ariaLabel={d.nav.languageAria} className="h-11 rounded-full px-3!" />
            <AccountMenu
              signInHref={localeHref(locale, "portal") + "?signin=1"}
              statusHref={status.href}
              labels={{ ...d.nav.account, signIn: d.nav.signIn, status: status.label }}
            />
            <TrackedLink event="send_case_cta_clicked" className="btn-primary ms-1 whitespace-nowrap" href={localeHref(locale, "send-my-case")}>
              {d.nav.send}
            </TrackedLink>
          </div>
        </HideOnPortal>
        {/* Signed-in patient navigation (My Care · Documents · Messages) mounts here beside the account menu. */}
        <div id="portal-nav-slot" className="flex flex-1 items-center justify-center empty:hidden" />
        <div id="portal-account-slot" className="flex items-center gap-2 empty:hidden" />

        <HideOnPortal locale={locale}>
          <MobileNav
            locale={locale}
            items={primaryNav(locale, d)}
            contact={{ label: d.common.whatsapp, href: whatsapp }}
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

"use client";

import { ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { TrackedLink } from "@/components/TrackedLink";
import type { Locale } from "@/lib/i18n";
import { localeHref } from "@/lib/links";

/** Routes where the bar would compete with the task in hand: the case form itself, the patient's own areas — and a Consultant's profile, which reads as a CV with no sales actions. */
const QUIET_ROUTES = /^\/[a-z]{2}\/(send-my-case|portal|proposal|activate|status|track-case|consultants\/[^/]+)(\/|$)/;
/** Scrolled past the opening screen, where the page's own primary action sits. */
const REVEAL_AFTER = 560;

/**
 * Phones only: once the reader has scrolled past the opening screen, "Start my case" stays one thumb away at the
 * bottom of the screen, with the reassurance that starting commits to nothing. It steps aside when the footer is in
 * view (the page's end needs no second call) and on routes where the patient is already in a task. Respects the
 * home-indicator safe area; slides rather than pops, except for reduced motion.
 */
export function MobileCaseBar({ locale, label, note }: { locale: Locale; label: string; note: string }) {
  const pathname = usePathname();
  const quiet = QUIET_ROUTES.test(pathname ?? "");
  const [scrolled, setScrolled] = useState(false);
  const [footerInView, setFooterInView] = useState(false);

  useEffect(() => {
    if (quiet) return;
    const onScroll = () => setScrolled(window.scrollY > REVEAL_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const footer = document.querySelector(".site-footer");
    const observer = footer ? new IntersectionObserver(([entry]) => setFooterInView(entry.isIntersecting)) : null;
    if (footer && observer) observer.observe(footer);
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [quiet, pathname]);

  const shown = !quiet && scrolled && !footerInView;

  // Lets other fixed elements (the brand preview switch) step up while the bar is on screen.
  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.caseBar = "on";
    else delete root.dataset.caseBar;
    return () => { delete root.dataset.caseBar; };
  }, [shown]);

  if (quiet) return null;

  return (
    <div
      className={
        "mobile-case-bar fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-default/95 px-4 pt-3 shadow-[0_-12px_30px_-22px_rgba(20,38,43,0.45)] backdrop-blur-md transition-transform duration-300 ease-out motion-reduce:transition-none sm:hidden " +
        (shown ? "translate-y-0" : "pointer-events-none translate-y-full")
      }
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      // Off screen it is out of the tab order and the accessibility tree, not merely invisible.
      inert={!shown}
    >
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[0.8125rem] font-semibold leading-5 text-ink-600">{note}</p>
        <TrackedLink event="send_case_cta_clicked" className="btn-primary flex-none" href={localeHref(locale, "send-my-case")}>
          {label}
          <ArrowRight size={17} aria-hidden="true" className="rtl:-scale-x-100" />
        </TrackedLink>
      </div>
    </div>
  );
}

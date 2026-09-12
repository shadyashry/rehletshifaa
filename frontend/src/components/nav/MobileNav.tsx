"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, UserRound, X } from "lucide-react";

import type { Locale } from "@/lib/i18n";
import { localeHref, type NavItem } from "@/lib/links";
import { TrackedLink } from "@/components/TrackedLink";
import { LocaleSwitch } from "./LocaleSwitch";

type MobileNavProps = {
  locale: Locale;
  items: readonly NavItem[];
  labels: {
    open: string;
    close: string;
    nav: string;
    send: string;
    signIn: string;
    signInHint: string;
    language: string;
    languageAria: string;
  };
};

/**
 * In-flow disclosure rather than an overlay: no scroll lock and no focus trap
 * are needed, so the whole interaction stays small. The panel closes on Escape
 * and whenever a link inside it is followed.
 */
export function MobileNav({ locale, items, labels }: MobileNavProps) {
  const panelId = useId();
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const close = () => detailsRef.current?.removeAttribute("open");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <details ref={detailsRef} className="group nav:hidden">
      {/* A quiet 44px control flush with the container edge: touch-sized, but never a boxed square
          competing with the wordmark. The open state is the only time it takes a surface. */}
      <summary
        aria-controls={panelId}
        aria-label={labels.open}
        className="-me-2 inline-flex h-11 w-11 cursor-pointer touch-manipulation list-none items-center justify-center rounded-lg text-brand-900 transition-colors hover:bg-brand-50 group-open:bg-brand-50 [&::-webkit-details-marker]:hidden"
      >
        <Menu size={24} strokeWidth={1.9} className="group-open:hidden" aria-hidden="true" />
        <X size={24} strokeWidth={1.9} className="hidden group-open:block" aria-hidden="true" />
        <span className="sr-only">{labels.open} / {labels.close}</span>
      </summary>

      <div
        id={panelId}
        className="absolute inset-x-0 top-full z-50 border-b border-line bg-surface-pearl shadow-[0_18px_40px_-24px_rgba(8,38,59,0.35)]"
      >
        <div className="container-site py-3">
          {/* Actions first — the primary conversion, then the outlined account action — then the destinations. */}
          <div className="grid gap-2.5 pb-3">
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-primary w-full"
              href={localeHref(locale, "send-my-case")}
              onClick={close}
            >
              {labels.send}
            </TrackedLink>
            <Link
              href={localeHref(locale, "portal") + "?signin=1"}
              onClick={close}
              title={labels.signInHint}
              className="btn-outline w-full min-h-12"
            >
              <UserRound size={17} strokeWidth={1.9} aria-hidden="true" />
              {labels.signIn}
            </Link>
          </div>
          <nav aria-label={labels.nav} className="grid gap-1 border-t border-line pt-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={pathname === item.href ? "page" : undefined}
                className="relative z-10 block min-h-12 touch-manipulation rounded-md px-3 py-3 text-[1rem] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800 aria-[current=page]:text-brand-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-1 border-t border-line pt-2">
            <LocaleSwitch
              locale={locale}
              label={labels.language}
              ariaLabel={labels.languageAria}
              className="justify-start"
              onClick={close}
            />
          </div>
        </div>
      </div>
    </details>
  );
}

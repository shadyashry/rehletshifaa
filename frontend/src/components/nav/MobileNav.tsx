"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line text-brand-900 transition-colors hover:bg-brand-50 lg:hidden"
      >
        {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-white shadow-[0_18px_40px_-24px_rgba(8,38,59,0.45)] lg:hidden"
      >
        <div className="container-site py-4">
          <nav aria-label={labels.nav} className="grid gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={pathname === item.href ? "page" : undefined}
                className="rounded-md px-4 py-3.5 text-[1.02rem] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 grid gap-3 border-t border-line pt-4">
            <LocaleSwitch
              locale={locale}
              label={labels.language}
              ariaLabel={labels.languageAria}
              className="justify-start"
              onClick={close}
            />
            <TrackedLink
              event="send_case_cta_clicked"
              className="btn-primary w-full"
              href={localeHref(locale, "send-my-case")}
              onClick={close}
            >
              {labels.send}
            </TrackedLink>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { intlLocale, type Locale } from "@/lib/i18n";

export type StaffViewId = "work" | "mine" | "team";
export const isStaffViewId = (value: string | null | undefined): value is StaffViewId => value === "work" || value === "mine" || value === "team";
export type StaffViewItem = { id: StaffViewId; label: string; count?: number };

/**
 * The staff's places to work: My work, My cases, the Team queue (coordinators) and the Virtual Clinic when the person
 * has one. It is navigation, not a tablist — the header copy sits away from the panel it changes — so the current place
 * is `aria-current`. From `md` it lives in the site header beside the account menu (the `PatientNav` pattern); below
 * that the page repeats it inline, and each copy hides where the other shows, so a screen never carries two.
 */
export function StaffNav({ locale, label, items, current, clinic, onSelect, hrefFor }: StaffNavProps & { locale: Locale }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // The header slot exists only in the browser; binding it once after mount is the same pattern PortalAccount uses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSlot(document.getElementById("portal-nav-slot")); }, []);
  const nav = <StaffViewLinks locale={locale} label={label} items={items} current={current} clinic={clinic} onSelect={onSelect} hrefFor={hrefFor} variant="header"/>;
  return slot ? createPortal(nav, slot) : null;
}

type StaffNavProps = {
  label: string; items: StaffViewItem[]; current?: StaffViewId | null;
  clinic?: { href: string; label: string } | null; onSelect: (id: StaffViewId) => void;
  /** The view's own URL, so it opens in a new tab and can be shared; a plain click still switches in place. */
  hrefFor?: (id: StaffViewId) => string;
};

export function StaffViewLinks({ locale, label, items, current, clinic, onSelect, hrefFor, variant }: StaffNavProps & { locale: Locale; variant: "header" | "inline" }) {
  const count = (value?: number) => value ? <span className="ms-1.5 text-[0.8125rem] font-semibold tabular-nums text-ink-500"><span className="sr-only">, </span><bdi>{new Intl.NumberFormat(intlLocale(locale)).format(value)}</bdi></span> : null;
  const header = variant === "header";
  const base = header
    ? "inline-flex min-h-11 items-center rounded-lg px-3 text-[0.9rem] font-semibold transition"
    : "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-[0.9rem] font-semibold transition";
  const tone = (on: boolean) => header
    ? on ? "bg-brand-50 text-brand-800" : "text-ink-600 hover:bg-mist hover:text-brand-800"
    : on ? "border-brand-600 text-brand-800" : "border-transparent text-ink-600 hover:text-brand-800";
  return (
    <nav aria-label={label} className={header ? "hidden items-center gap-1 md:flex" : "mb-5 border-b border-line-strong md:hidden"}>
      <ul className={`flex flex-wrap items-center ${header ? "gap-1" : "gap-x-1"}`}>
        {items.map(item => (
          <li key={item.id}>
            {hrefFor ? (
              <a href={hrefFor(item.id)} aria-current={current === item.id ? "page" : undefined} className={`${base} ${tone(current === item.id)}`}
                 onClick={event => {
                   // A modified or middle click opens the view in a new tab or window, as any link does.
                   if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                   event.preventDefault(); onSelect(item.id);
                 }}>
                {item.label}{count(item.count)}
              </a>
            ) : (
              <button type="button" aria-current={current === item.id ? "page" : undefined} className={`${base} ${tone(current === item.id)}`} onClick={() => onSelect(item.id)}>
                {item.label}{count(item.count)}
              </button>
            )}
          </li>
        ))}
        {clinic && <li><a href={clinic.href} className={`${base} ${tone(false)}`}>{clinic.label}</a></li>}
      </ul>
    </nav>
  );
}

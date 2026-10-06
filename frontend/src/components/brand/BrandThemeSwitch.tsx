"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Brand preview switch, site-wide on the public site and patient portal (the layout hides it in the Control Center,
 * which stays on the bare base tokens). Three candidates: "Petrol & Paper" (`app/theme-petrol.css`, the default),
 * "Lapis Sky" (`app/theme-lapis.css`) and its night sibling "Lapis Night" (`app/theme-lapis-night.css`). The choice is a per-viewer convenience kept in localStorage (memory if
 * storage is unavailable); `BRAND_THEME_BOOT` applies it before first paint so pages never flash another theme.
 * Remove this component, the boot script and the theme stylesheets once the final brand is chosen.
 */
type BrandTheme = "petrol" | "lapis" | "night";
const THEMES: readonly BrandTheme[] = ["petrol", "lapis", "night"];
const DEFAULT_THEME: BrandTheme = "petrol";
const SWATCH: Record<BrandTheme, [string, string]> = { petrol: ["#0e4f55", "#e07a5f"], lapis: ["#1f3c88", "#1c7fd1"], night: ["#0e1a3d", "#e2b962"] };
const KEY = "rs:brand-theme-preview";
const FAVICON: Partial<Record<BrandTheme, string>> = { lapis: "/brand/favicon-lapis.png", night: "/brand/favicon-lapis.png" };

/** Inline <head> script: applies the saved theme (Petrol & Paper by default) before first paint, never inside the
 * Control Center, which keeps the bare base tokens. */
export const BRAND_THEME_BOOT = `(function(){if(/\\/portal\\/control-center(\\/|$)/.test(location.pathname))return;var t="petrol";try{var s=localStorage.getItem("${KEY}");if(s==="lapis"||s==="night")t=s}catch(e){}document.documentElement.setAttribute("data-brand-theme",t)})()`;
const listeners = new Set<() => void>();
let memory: BrandTheme | null = null;

function read(): BrandTheme {
  if (memory) return memory;
  try {
    const saved = window.localStorage.getItem(KEY);
    return THEMES.includes(saved as BrandTheme) ? (saved as BrandTheme) : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
}

function write(theme: BrandTheme) {
  memory = theme;
  try { window.localStorage.setItem(KEY, theme); } catch { /* storage unavailable: the in-memory choice still applies */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const COPY = {
  en: { label: "Brand preview", petrol: "Petrol & Paper", lapis: "Lapis Sky", night: "Lapis Night", short: { petrol: "Petrol", lapis: "Sky", night: "Night" } },
  ar: { label: "معاينة الهوية", petrol: "البترولي والورقي", lapis: "سماء اللازورد", night: "ليل اللازورد", short: { petrol: "البترولي", lapis: "السماء", night: "الليل" } },
} as const;

export function BrandThemeSwitch({ locale }: { locale: Locale }) {
  const theme = useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);
  const t = COPY[locale === "ar" ? "ar" : "en"];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.brandTheme = theme;
    // The browser-tab icon follows the theme: both Lapis themes show their three-colour mark; Petrol keeps the original icon.
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {
      icon.dataset.originalHref ??= icon.href;
      icon.href = FAVICON[theme] ?? icon.dataset.originalHref ?? icon.href;
    }
    return () => {
      delete root.dataset.brandTheme;
      if (icon?.dataset.originalHref) icon.href = icon.dataset.originalHref;
    };
  }, [theme]);

  return (
    <div
      role="group"
      aria-label={t.label}
      className="fixed bottom-4 right-4 z-40 flex transition-[bottom] duration-300 [html[data-case-bar=on]_&]:bottom-[5.5rem] items-center gap-1 rounded-full border border-border-subtle bg-surface-default p-1 text-[0.8125rem] font-semibold shadow-[0_10px_30px_-18px_rgba(20,48,43,0.55)]"
    >
      <span className="hidden px-2.5 text-ink-500 lg:inline">{t.label}</span>
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          aria-label={t[option]}
          onClick={() => write(option)}
          className={
            "inline-flex min-h-10 min-w-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 transition-colors sm:px-3 " +
            (theme === option ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-surface-clinical")
          }
        >
          <span aria-hidden className="flex">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SWATCH[option][0] }} />
            <span className="-ms-1 h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: SWATCH[option][1] }} />
          </span>
          {/* Phones show the short name; the full name is the accessible name everywhere. */}
          <span className="sm:hidden">{t.short[option]}</span>
          <span className="hidden sm:inline">{t[option]}</span>
        </button>
      ))}
    </div>
  );
}

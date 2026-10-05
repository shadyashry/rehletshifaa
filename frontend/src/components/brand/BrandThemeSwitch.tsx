"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Brand preview switch, site-wide on the public site and patient portal (the layout hides it in the Control Center,
 * which stays on the bare base tokens). Two candidates remain: the polished "Original" (`app/theme-original.css`, the
 * default) and "Lapis Night" (`app/theme-lapis.css`). The choice is a per-viewer convenience kept in localStorage (memory if
 * storage is unavailable); `BRAND_THEME_BOOT` applies it before first paint so pages never flash another theme.
 * Remove this component, the boot script and the theme stylesheets once the final brand is chosen.
 */
type BrandTheme = "original" | "lapis";
const THEMES: readonly BrandTheme[] = ["original", "lapis"];
const SWATCH: Record<BrandTheme, [string, string]> = { original: ["#247c86", "#65bdb5"], lapis: ["#1f3c88", "#1c7fd1"] };
const KEY = "rs:brand-theme-preview";
const FAVICON: Partial<Record<BrandTheme, string>> = { lapis: "/brand/favicon-lapis.png" };

/** Inline <head> script: applies the saved theme (the polished Original by default) before first paint, never inside the
 * Control Center, which keeps the bare base tokens. */
export const BRAND_THEME_BOOT = `(function(){if(/\\/portal\\/control-center(\\/|$)/.test(location.pathname))return;var t="original";try{var s=localStorage.getItem("${KEY}");if(s==="lapis")t=s}catch(e){}document.documentElement.setAttribute("data-brand-theme",t)})()`;
const listeners = new Set<() => void>();
let memory: BrandTheme | null = null;

function read(): BrandTheme {
  if (memory) return memory;
  try {
    const saved = window.localStorage.getItem(KEY);
    return THEMES.includes(saved as BrandTheme) ? (saved as BrandTheme) : "original";
  } catch { return "original"; }
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
  en: { label: "Brand preview", original: "Original", lapis: "Lapis Night", short: { original: "Original", lapis: "Lapis" } },
  ar: { label: "معاينة الهوية", original: "الأصلية", lapis: "سماء اللازورد", short: { original: "الأصلية", lapis: "اللازورد" } },
} as const;

export function BrandThemeSwitch({ locale }: { locale: Locale }) {
  const theme = useSyncExternalStore(subscribe, read, () => "original" as BrandTheme);
  const t = COPY[locale === "ar" ? "ar" : "en"];

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.brandTheme = theme;
    // The browser-tab icon follows the theme: Lapis shows its three-colour mark; the others keep the original icon.
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
      className="fixed bottom-4 right-4 z-40 flex items-center gap-1 rounded-full border border-border-subtle bg-surface-default p-1 text-[0.8125rem] font-semibold shadow-[0_10px_30px_-18px_rgba(20,48,43,0.55)]"
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

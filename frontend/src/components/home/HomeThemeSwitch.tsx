"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Brand preview switch (home page only). While the home page is mounted it can put the candidate themes
 * ("Malachite & Gold", `app/theme-malachite.css`; "Lapis Night", `app/theme-lapis.css`) on <html>; leaving the home page always restores the original theme, so no other
 * page is affected. The choice is a per-viewer convenience kept in localStorage (memory if storage is unavailable).
 * Remove this component and the stylesheet once the final brand is chosen.
 */
type BrandTheme = "original" | "malachite" | "lapis";
const THEMES: readonly BrandTheme[] = ["original", "malachite", "lapis"];
const SWATCH: Record<BrandTheme, [string, string]> = { original: ["#247c86", "#65bdb5"], malachite: ["#0f5c4d", "#d4a24c"], lapis: ["#1f3c88", "#b23a20"] };
const KEY = "rs:brand-theme-preview";
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
  en: { label: "Brand preview", original: "Original", malachite: "Malachite & Gold", lapis: "Lapis Night", short: { original: "Original", malachite: "Malachite", lapis: "Lapis" } },
  ar: { label: "معاينة الهوية", original: "الأصلية", malachite: "الملكيت والذهبي", lapis: "سماء اللازورد", short: { original: "الأصلية", malachite: "الملكيت", lapis: "اللازورد" } },
} as const;

export function HomeThemeSwitch({ locale }: { locale: Locale }) {
  const theme = useSyncExternalStore(subscribe, read, () => "original" as BrandTheme);
  const t = COPY[locale === "ar" ? "ar" : "en"];

  useEffect(() => {
    const root = document.documentElement;
    if (theme !== "original") root.dataset.brandTheme = theme;
    else delete root.dataset.brandTheme;
    return () => { delete root.dataset.brandTheme; };
  }, [theme]);

  return (
    <div
      role="group"
      aria-label={t.label}
      className="fixed bottom-4 start-4 z-40 flex items-center gap-1 rounded-full border border-border-subtle bg-surface-default p-1 text-[0.8125rem] font-semibold shadow-[0_10px_30px_-18px_rgba(20,48,43,0.55)]"
    >
      <span className="hidden px-2.5 text-ink-500 sm:inline">{t.label}</span>
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={theme === option}
          aria-label={t[option]}
          onClick={() => write(option)}
          className={
            "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 transition-colors sm:px-3 " +
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

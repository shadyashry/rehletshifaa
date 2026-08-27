"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";

import { alternateLocale, type Locale } from "@/lib/i18n";
import { swapLocale } from "@/lib/links";

/**
 * Language switch that keeps the reader on the same route instead of sending
 * them back to the locale home page.
 */
export function LocaleSwitch({
  locale,
  label,
  ariaLabel,
  className = "",
  onClick,
}: {
  locale: Locale;
  label: string;
  ariaLabel: string;
  className?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const target = alternateLocale(locale);

  return (
    <Link
      href={swapLocale(pathname ?? `/${locale}`, target)}
      hrefLang={target}
      lang={target}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700 ${className}`}
    >
      <Languages size={17} aria-hidden="true" />
      {label}
    </Link>
  );
}

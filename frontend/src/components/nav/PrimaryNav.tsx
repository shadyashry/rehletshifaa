"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { NavItem } from "@/lib/links";

/** One item in the navigation track: the current page (or an open menu) is lifted as a white pill. */
export const navPill = (active: boolean) =>
  `relative whitespace-nowrap rounded-full px-4 py-2 text-[0.9375rem] font-medium transition-[background-color,color,box-shadow] duration-200 ${
    active
      ? "bg-surface-default text-brand-900 shadow-[0_2px_8px_-3px_rgba(36,64,74,0.3)] ring-1 ring-border-subtle"
      : "text-ink-600 hover:bg-surface-default/70 hover:text-brand-800"
  }`;

/**
 * Desktop navigation as one soft track of pills. Client-side so the active route can be marked with
 * `aria-current`; `leading` takes the Care Areas disclosure, first in reading order (what → who → how).
 */
export function PrimaryNav({ items, label, leading }: { items: readonly NavItem[]; label: string; leading?: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="hidden items-center gap-0.5 rounded-full bg-surface-clinical/80 p-1 ring-1 ring-border-subtle nav:flex">
      {leading}
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={navPill(active)}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

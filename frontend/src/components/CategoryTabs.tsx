"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/lib/links";

/**
 * Horizontal tab strip that lets a reader move between the three care-area
 * pages. Client-only so the current area can be marked with `aria-current`.
 * Scrolls horizontally on narrow screens rather than wrapping.
 */
export function CategoryTabs({ tabs, label }: { tabs: readonly NavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="border-b border-line bg-white">
      <div className="container-site flex gap-1.5 overflow-x-auto py-2.5">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-4 py-2.5 text-[0.95rem] font-semibold transition-colors ${
                active
                  ? "bg-brand-600 text-white"
                  : "text-ink-600 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

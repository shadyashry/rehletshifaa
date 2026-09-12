"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/lib/links";

/**
 * Desktop navigation. Client-side only so the active route can be marked with
 * `aria-current`; no other behaviour runs on the client.
 */
export function PrimaryNav({ items, label }: { items: readonly NavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="hidden items-center gap-1 nav:flex">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative whitespace-nowrap rounded-lg px-2.5 py-2 text-[0.95rem] font-medium transition-colors ${
              active
                ? "text-brand-900 after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500"
                : "text-ink-600 hover:text-brand-800 hover:bg-brand-50/70"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

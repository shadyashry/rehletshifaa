"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { AnalyticsEvent } from "@/lib/analytics";
import { track } from "@/lib/analytics";

export function TrackedLink({
  href,
  event,
  className,
  children,
  target,
  onClick,
}: {
  href: string;
  event: AnalyticsEvent;
  className?: string;
  children: ReactNode;
  target?: string;
  onClick?: () => void;
}) {
  const handleClick = () => {
    track(event);
    onClick?.();
  };
  // A link that opens a new tab gains nothing from client navigation, and a Next <Link> would prefetch it: for a
  // route handler that redirects off-site (the /{locale}/whatsapp entry) that prefetch never settles.
  if (target === "_blank") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={handleClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} target={target} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

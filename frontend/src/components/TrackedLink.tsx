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
  return (
    <Link
      href={href}
      target={target}
      rel={target === "_blank" ? "noreferrer" : undefined}
      className={className}
      onClick={() => {
        track(event);
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}

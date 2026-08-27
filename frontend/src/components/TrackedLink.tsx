"use client";
import Link from "next/link";
import type { AnalyticsEvent } from "@/lib/analytics";
import { track } from "@/lib/analytics";

export function TrackedLink({ href, event, className, children, target }: { href: string; event: AnalyticsEvent; className?: string; children: React.ReactNode; target?: string }) {
  return <Link href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined} className={className} onClick={() => track(event)}>{children}</Link>;
}


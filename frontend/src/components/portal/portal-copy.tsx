"use client";

import { createContext, use, useMemo, type ReactNode } from "react";

import type { Locale } from "@/lib/i18n";
import type { WorkCopy } from "@/lib/portal-labels";

/** The work copy together with the locale it was written in, so plurals and formats can never pair it with another. */
export type LocalizedWorkCopy = WorkCopy & { locale: Locale };

/**
 * The staff work copy for the current locale, provided once by the portal page (from `messages/*.json`) so the queue,
 * My Work and the current-action panel read the same words without threading another prop through every view.
 */
const WorkCopyContext = createContext<LocalizedWorkCopy | null>(null);

export function WorkCopyProvider({ locale, copy, children }: { locale: Locale; copy: WorkCopy; children: ReactNode }) {
  const value = useMemo(() => ({ ...copy, locale }), [copy, locale]);
  return <WorkCopyContext value={value}>{children}</WorkCopyContext>;
}

export function useWorkCopy(): LocalizedWorkCopy {
  const copy = use(WorkCopyContext);
  if (!copy) throw new Error("useWorkCopy must be used inside WorkCopyProvider");
  return copy;
}

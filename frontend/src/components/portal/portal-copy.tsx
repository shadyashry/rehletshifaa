"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { WorkCopy } from "@/lib/portal-labels";

/**
 * The staff work copy for the current locale, provided once by the portal page (from `messages/*.json`) so the queue,
 * My Work and the current-action panel read the same words without threading another prop through every view.
 */
const WorkCopyContext = createContext<WorkCopy | null>(null);

export function WorkCopyProvider({ copy, children }: { copy: WorkCopy; children: ReactNode }) {
  return <WorkCopyContext.Provider value={copy}>{children}</WorkCopyContext.Provider>;
}

export function useWorkCopy(): WorkCopy {
  const copy = useContext(WorkCopyContext);
  if (!copy) throw new Error("useWorkCopy must be used inside WorkCopyProvider");
  return copy;
}

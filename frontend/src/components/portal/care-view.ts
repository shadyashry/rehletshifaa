import type { MouseEvent } from "react";

import type { CareView } from "@/components/portal/MyCare";

/**
 * The address of a My Care view on a case (`?case=…&view=…`, keeping the working role when the URL names one), so My
 * Care, Documents and Messages are real links: they open in a new tab and can be copied. A plain click stays in the page.
 */
export function careViewHref(caseId: string, view: CareView): string {
  const query = new URLSearchParams();
  const role = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("role");
  if (role) query.set("role", role);
  query.set("case", caseId);
  if (view !== "care") query.set("view", view);
  return `?${query}`;
}

/** A primary-button click with no modifier: the page handles it; anything else is left to the browser (new tab, copy). */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
